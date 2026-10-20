package com.avengers.endgame.security;

import com.avengers.endgame.account.Account;
import com.avengers.endgame.account.AccountRepository;
import com.avengers.endgame.integration.pricing.client.PricingApiClient;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.order.domain.Order;
import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderType;
import com.avengers.endgame.order.repository.OrderRepository;
import com.avengers.endgame.user.UserProvisioningService;
import com.avengers.endgame.user.UserRepository;
import com.avengers.endgame.user.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static java.time.temporal.ChronoUnit.MINUTES;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Owner: security layer (tests). The HTTP-level check of everything SecurityConfig sets up, sending
//   requests the way the frontend does: "Authorization: Bearer <token>".
// What runs: the whole chain, in order. Decoder (401) -> URL rules (403) -> UserProvisioningInterceptor
//   -> controller with @CurrentUserId -> owner-scoped service (404).
// How Spring runs it:
//   - @SpringBootTest starts the full application context; no server is started.
//   - @AutoConfigureMockMvc gives a MockMvc whose requests pass through the registered servlet
//     filters (addFilters defaults to true), so Spring Security's filter chain runs for real.
// Tokens: real HS256 tokens, shaped like auth-server's and signed with the app's own test secret
//   (jwt.shared-secret in src/test/resources). So the decoder, the "roles" -> ROLE_ mapping and the URL
//   rules are all exercised exactly as in production. Spring Security's jwt() test helper would skip
//   the decoder and our roles mapping, so it isn't used.
// Mocks:
//   - UserProvisioningService: H2 can't run its upsert (ON CONFLICT ... DO UPDATE). Here we only check
//     when the interceptor calls it; the real SQL is tested in OrderFlowIntegrationTest (Postgres only).
//   - PricingApiClient: no calls to Fauxnance.
// Not covered here: rule 1 in SecurityConfig (FORWARD/ERROR dispatches). MockMvc has no servlet
//   container, so Spring Boot's re-dispatch to /error never happens. That rule needs a running server.
@SpringBootTest(properties = {
        // A private in-memory database for this class, with tables created from the entities.
        // Never the shared test database: when -Dorder.test.* points the tests at Postgres,
        // create-drop there would drop the real schema.
        "spring.datasource.url=jdbc:h2:mem:security-chain-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@AutoConfigureMockMvc
class SecurityChainTest {

    private static final String INSTRUMENTS = "/api/v1/instruments";
    private static final String ORDERS = "/api/v1/orders";

    @Autowired private MockMvc mvc;
    @Autowired private UserRepository users;
    @Autowired private AccountRepository accounts;
    @Autowired private OrderRepository orders;
    @Autowired private JdbcTemplate jdbc;

    @MockitoBean private UserProvisioningService provisioning;
    @MockitoBean private PricingApiClient pricing;

    // The same values SecurityConfig's decoder checks against.
    @Value("${jwt.shared-secret}") private String secret;
    @Value("${jwt.issuer}") private String issuer;
    @Value("${jwt.audience}") private String audience;

    // A fresh caller per test, so tests never share state through the database.
    private final UUID caller = UUID.randomUUID();

    // ---- 1. Authentication: SecurityConfig.jwtDecoder -------------------------------------------------

    @Test
    void noToken_is401_withABearerChallenge_andNoSession() throws Exception {
        MvcResult result = mvc.perform(get(INSTRUMENTS))
                .andExpect(status().isUnauthorized())
                // Spring Security tells the client which scheme to use (7.x adds resource_metadata after it).
                .andExpect(header().string("WWW-Authenticate", startsWith("Bearer")))
                .andReturn();
        // STATELESS: no HTTP session, so no JSESSIONID cookie, not even on a 401.
        assertNull(result.getRequest().getSession(false));
    }

    @Test
    void validClientToken_getsTheInstruments_andNoSession() throws Exception {
        // The branch's goal call: GET /api/v1/instruments with a bearer token -> 200.
        MvcResult result = mvc.perform(as(get(INSTRUMENTS), token(caller, "CLIENT")))
                .andExpect(status().isOk())
                .andReturn();
        assertNull(result.getRequest().getSession(false));
    }

    @Test
    void everyBadToken_is401() throws Exception {
        // 1. Each token is wrong in exactly one way.
        Instant valid = Instant.now().plus(15, MINUTES);
        Map<String, String> badTokens = new LinkedHashMap<>();
        badTokens.put("signed with another secret",
                token(caller, List.of("CLIENT"), "another-secret-that-is-also-at-least-32-characters", issuer, audience, valid));
        // Expired 5 minutes ago: well past the decoder's default 60-second clock-skew allowance.
        badTokens.put("expired",
                token(caller, List.of("CLIENT"), secret, issuer, audience, Instant.now().minus(5, MINUTES)));
        badTokens.put("issued by someone other than auth-server",
                token(caller, List.of("CLIENT"), secret, "someone-else", audience, valid));
        // e.g. a token meant for a future analyst backend, signed with the same secret.
        badTokens.put("meant for another audience",
                token(caller, List.of("CLIENT"), secret, issuer, "another-api", valid));
        badTokens.put("unsigned (alg: none)", unsignedToken(caller));
        badTokens.put("not a JWT at all", "not-a-jwt");

        // 2. Every one is rejected by the decoder before any URL rule or controller runs.
        for (Map.Entry<String, String> bad : badTokens.entrySet()) {
            int status = mvc.perform(as(get(INSTRUMENTS), bad.getValue())).andReturn().getResponse().getStatus();
            assertEquals(401, status, "Token " + bad.getKey());
        }
        verifyNoInteractions(provisioning);
    }

    // ---- 2. Authorization: SecurityConfig.filterChain URL rules -------------------------------------------

    @Test
    void clientRoutes_areClientOnly() throws Exception {
        // 1. A client gets through (rule 7). No account exists because provisioning is mocked, so the
        //    owner-scoped list is simply empty.
        mvc.perform(as(get(ORDERS), token(caller, "CLIENT"))).andExpect(status().isOk());
        // 2. Staff are refused on every client prefix: orders, bank accounts, /me.
        for (String role : List.of("ADMIN", "SUPER_ADMIN", "ANALYST")) {
            String staff = token(UUID.randomUUID(), role);
            mvc.perform(as(get(ORDERS), staff)).andExpect(status().isForbidden());
            mvc.perform(as(get("/api/v1/bank-accounts"), staff)).andExpect(status().isForbidden());
            mvc.perform(as(put("/api/v1/me/watchlist/AAPL"), staff)).andExpect(status().isForbidden());
        }
    }

    @Test
    void addingInstruments_isAdminOnly() throws Exception {
        // 1. Clients and analysts are refused (rule 4), with no body.
        for (String role : List.of("CLIENT", "ANALYST")) {
            mvc.perform(as(post(INSTRUMENTS), token(caller, role)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden())
                    .andExpect(content().string(""));
        }
        // 2. Admins pass security; the empty body then fails @Valid in the controller (400, not 403).
        for (String role : List.of("ADMIN", "SUPER_ADMIN")) {
            mvc.perform(as(post(INSTRUMENTS), token(caller, role)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void readingInstrumentsAndQuotes_isOpenToEverySignedInRole() throws Exception {
        when(pricing.getQuote("AAPL")).thenReturn(new QuoteResponse("AAPL", new BigDecimal("50"), new BigDecimal("49.9"),
                new BigDecimal("50.1"), null, "USD", null, null, null, Instant.now(), "OPEN", false, "test"));
        for (String role : List.of("CLIENT", "ANALYST", "ADMIN")) {
            String token = token(UUID.randomUUID(), role);
            // 1. Rule 5: GET instruments.
            mvc.perform(as(get(INSTRUMENTS), token)).andExpect(status().isOk());
            // 2. Rule 6: quotes live under /orders but sit above the CLIENT-only rule 7, so staff get them too.
            mvc.perform(as(get(ORDERS + "/quote/symbol/AAPL"), token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.symbol").value("AAPL"));
        }
    }

    @Test
    void urlsWithoutARule_areDenied() throws Exception {
        String client = token(caller, "CLIENT");
        // 1. Rule 8 (deny by default): a URL with no rule is refused even with a valid token, before Spring MVC
        //    looks for a controller. POST /api/v1/users was a real endpoint until it was removed; if one comes
        //    back at that path without a rule, it stays closed.
        mvc.perform(as(post("/api/v1/users"), client).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        // 2. Unknown URLs are 403, not 404: the rules run before Spring MVC looks the route up.
        mvc.perform(as(get("/api/v1/no-such-thing"), client)).andExpect(status().isForbidden());
        // 3. Paths outside /api/v1 too (where the removed holdings controller used to live).
        mvc.perform(as(get("/accounts/" + UUID.randomUUID() + "/holdings"), client)).andExpect(status().isForbidden());
        // 4. Without a token the same requests are 401: authentication is checked first.
        mvc.perform(post("/api/v1/users").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void apiDocs_arePublic_andNeverProvision() throws Exception {
        // Rule 2. The interceptor is registered only on /api/v1/**, so docs never create anyone.
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
        mvc.perform(as(get("/v3/api-docs"), token(caller, "CLIENT"))).andExpect(status().isOk());
        verifyNoInteractions(provisioning);
    }

    // ---- 3. Provisioning: UserProvisioningInterceptor -------------------------------------------------------

    @Test
    void anAcceptedRequest_provisionsTheCaller_withTheirStoredRole() throws Exception {
        // 1. Client: sub, email and the stored (lower-case) role come from the validated token.
        mvc.perform(as(get(INSTRUMENTS), token(caller, "CLIENT"))).andExpect(status().isOk());
        verify(provisioning).provision(caller, email(caller), UserRole.client, null, null);
        // 2. Staff get a users row too, with their own role (SUPER_ADMIN is stored as admin).
        UUID analyst = UUID.randomUUID();
        mvc.perform(as(get(INSTRUMENTS), token(analyst, "ANALYST"))).andExpect(status().isOk());
        verify(provisioning).provision(analyst, email(analyst), UserRole.analyst, null, null);
        UUID superAdmin = UUID.randomUUID();
        mvc.perform(as(get(INSTRUMENTS), token(superAdmin, "SUPER_ADMIN"))).andExpect(status().isOk());
        verify(provisioning).provision(superAdmin, email(superAdmin), UserRole.admin, null, null);
    }

    @Test
    void theTokensNames_arePassedToProvisioning() throws Exception {
        // auth-server adds given_name/family_name when the user has them; the interceptor passes them on.
        String named = token(caller, List.of("CLIENT"), secret, issuer, audience, Instant.now().plus(15, MINUTES),
                Map.of("given_name", "Ada", "family_name", "Lovelace"));
        mvc.perform(as(get(INSTRUMENTS), named)).andExpect(status().isOk());
        verify(provisioning).provision(caller, email(caller), UserRole.client, "Ada", "Lovelace");
    }

    @Test
    void rejectedRequests_neverProvision() throws Exception {
        // 401 (no token), 403 (staff on a client route), 403 (no rule): the interceptor runs only after
        // Spring Security has let a request through.
        mvc.perform(get(ORDERS)).andExpect(status().isUnauthorized());
        mvc.perform(as(get(ORDERS), token(caller, "ADMIN"))).andExpect(status().isForbidden());
        mvc.perform(as(get("/api/v1/no-such-thing"), token(caller, "CLIENT"))).andExpect(status().isForbidden());
        verifyNoInteractions(provisioning);
    }

    @Test
    void aTokenWithNoKnownRole_isSignedInButProvisionsNothing() throws Exception {
        String roleless = token(caller, List.of("SOMETHING_ELSE"), secret, issuer, audience, Instant.now().plus(15, MINUTES));
        // 1. It's a valid token, so "any signed-in role" routes accept it...
        mvc.perform(as(get(INSTRUMENTS), roleless)).andExpect(status().isOk());
        // 2. ...but it's not a CLIENT, and it never gets a users row or a trading account.
        mvc.perform(as(get(ORDERS), roleless)).andExpect(status().isForbidden());
        verify(provisioning, never()).provision(any(), any(), any(), any(), any());
    }

    // ---- 4. Ownership: @CurrentUserId -> owner-scoped services ------------------------------------------

    @Test
    void anotherClientsOrder_is404_exactlyLikeAMissingOne() throws Exception {
        // 1. Client A owns an account with one order. Client B exists but owns nothing of A's.
        UUID clientA = UUID.randomUUID();
        UUID clientB = UUID.randomUUID();
        insertClient(clientA);
        insertClient(clientB);
        Account accountA = accounts.save(new Account(users.findById(clientA).orElseThrow(), BigDecimal.ZERO));
        Order orderA = orders.save(new Order(accountA.getAccountId(), UUID.randomUUID(), OrderType.market,
                OrderSide.buy, BigDecimal.ONE, null, null));
        UUID missing = UUID.randomUUID();

        // 2. A sees their own order: @CurrentUserId gave the service A's id from A's token.
        mvc.perform(as(get(ORDERS + "/" + orderA.getOrderId()), token(clientA, "CLIENT")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(orderA.getOrderId().toString()));

        // 3. B asking for A's order gets the same 404 as asking for an order that doesn't exist,
        //    so B can't even learn that A's order exists.
        String clientBToken = token(clientB, "CLIENT");
        mvc.perform(as(get(ORDERS + "/" + orderA.getOrderId()), clientBToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Order with ID " + orderA.getOrderId() + " not found"));
        mvc.perform(as(get(ORDERS + "/" + missing), clientBToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Order with ID " + missing + " not found"));

        // 4. Same for listing by A's account id.
        mvc.perform(as(get(ORDERS).param("accountId", accountA.getAccountId().toString()), clientBToken))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Account not found"));
    }

    // ---- Helpers ----------------------------------------------------------------------------------------

    // Adds "Authorization: Bearer <token>", as the frontend's interceptor does.
    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String token) {
        return request.header("Authorization", "Bearer " + token);
    }

    // A valid token for one role: correct secret, issuer and audience, expiring in 15 minutes.
    private String token(UUID sub, String role) {
        return token(sub, List.of(role), secret, issuer, audience, Instant.now().plus(15, MINUTES));
    }

    // A token shaped like auth-server's (sub, email, roles, iss, aud, iat, exp), signed with HS256.
    // Each argument can be made wrong on purpose for the 401 tests.
    private String token(UUID sub, List<String> roles, String signingSecret, String iss, String aud, Instant expiresAt) {
        return token(sub, roles, signingSecret, iss, aud, expiresAt, Map.of());
    }

    // The same, plus extra claims (e.g. the given_name/family_name auth-server adds when the user has them).
    private String token(UUID sub, List<String> roles, String signingSecret, String iss, String aud, Instant expiresAt,
                         Map<String, Object> extraClaims) {
        // 1. Same key construction as SecurityConfig.jwtDecoder: the secret's UTF-8 bytes as an HMAC key.
        SecretKeySpec key = new SecretKeySpec(signingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        JwtEncoder encoder = NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
        // 2. The claims auth-server puts in every access token.
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
                .subject(sub.toString())
                .claim("amr", List.of("pwd", "mfa"))
                .claim("email", email(sub))
                .claim("roles", roles)
                .issuer(iss)
                .audience(List.of(aud))
                .issuedAt(expiresAt.minus(15, MINUTES))
                .expiresAt(expiresAt);
        extraClaims.forEach(builder::claim);
        JwtClaimsSet claims = builder.build();
        // 3. Sign and serialize to the compact "header.payload.signature" form.
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    // Valid claims but "alg": "none" and no signature: the classic forged token.
    private String unsignedToken(UUID sub) {
        Base64.Encoder base64 = Base64.getUrlEncoder().withoutPadding();
        String header = "{\"alg\":\"none\",\"typ\":\"JWT\"}";
        String payload = "{\"sub\":\"" + sub + "\",\"roles\":[\"CLIENT\"],\"iss\":\"" + issuer + "\",\"aud\":\""
                + audience + "\",\"exp\":" + Instant.now().plus(15, MINUTES).getEpochSecond() + "}";
        return base64.encodeToString(header.getBytes(StandardCharsets.UTF_8)) + "."
                + base64.encodeToString(payload.getBytes(StandardCharsets.UTF_8)) + ".";
    }

    private static String email(UUID sub) {
        return sub + "@example.com";
    }

    // A client's users row, inserted directly because provisioning is mocked in this class.
    private void insertClient(UUID userId) {
        jdbc.update("insert into users (user_id, email, role, created_at) values (?, ?, 'client', CURRENT_TIMESTAMP)",
                userId, email(userId));
    }
}
