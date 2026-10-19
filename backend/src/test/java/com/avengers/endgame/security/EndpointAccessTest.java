package com.avengers.endgame.security;

import com.avengers.endgame.integration.pricing.client.PricingApiClient;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.user.UserProvisioningService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Stream;

import static java.time.temporal.ChronoUnit.MINUTES;
import static java.util.Map.entry;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

// Owner: security layer (tests). The access matrix: every endpoint the client backend serves and the
//   roles allowed to call it. It covers endpoints no other test knows about, e.g. ones that arrive in a merge.
// What it checks:
//   1. The endpoints Spring actually serves are exactly the rows of ACCESS. A new endpoint fails here until
//      someone adds a row for it (and a URL rule in SecurityConfig).
//   2. For every row: no token -> 401, every role not in the row -> 403, every role in the row gets past
//      security (any status but 401/403; a 400 or 404 from the controller is fine, it means the request
//      reached it).
// How Spring runs it: the same setup as SecurityChainTest. @SpringBootTest + MockMvc run the real filter
//   chain, with real HS256 tokens and a private H2 database. The served endpoints come from Spring MVC's
//   RequestMappingHandlerMapping, which holds every @RequestMapping method it registered at startup.
// Mocks: UserProvisioningService (H2 can't run its upsert) and PricingApiClient (no calls to Fauxnance).
// To change who may call an endpoint: change its URL rule in SecurityConfig and its row here, together.
@SpringBootTest(properties = {
        // A private in-memory database, never the shared test one (see SecurityChainTest).
        "spring.datasource.url=jdbc:h2:mem:endpoint-access-test;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@AutoConfigureMockMvc
class EndpointAccessTest {

    // Every role SecurityConfig's URL rules name. SUPER_ADMIN has an admin's access.
    private static final List<String> ROLES = List.of("CLIENT", "ANALYST", "ADMIN", "SUPER_ADMIN");
    private static final Set<String> CLIENT = Set.of("CLIENT");
    private static final Set<String> ADMIN = Set.of("ADMIN", "SUPER_ADMIN");
    private static final Set<String> ANY_ROLE = Set.copyOf(ROLES);

    // The access matrix: "METHOD path" exactly as the controller maps it -> the roles allowed to call it.
    private static final Map<String, Set<String>> ACCESS = Map.ofEntries(
            // Instruments: anyone signed in may read; only admins may add.
            entry("GET /api/v1/instruments", ANY_ROLE),
            entry("GET /api/v1/instruments/{symbol}", ANY_ROLE),
            entry("POST /api/v1/instruments", ADMIN),
            // Quotes live under /orders but are open to anyone signed in.
            entry("GET /api/v1/orders/quote/{instrumentId}", ANY_ROLE),
            entry("GET /api/v1/orders/quote/symbol/{symbol}", ANY_ROLE),
            // A client's own data.
            entry("GET /api/v1/orders", CLIENT),
            entry("POST /api/v1/orders", CLIENT),
            entry("GET /api/v1/orders/{orderId}", CLIENT),
            entry("PATCH /api/v1/orders/{orderId}", CLIENT),
            entry("PATCH /api/v1/orders/{orderId}/cancel", CLIENT),
            entry("GET /api/v1/bank-accounts", CLIENT),
            entry("POST /api/v1/bank-accounts", CLIENT),
            entry("DELETE /api/v1/bank-accounts/{bankAccountId}", CLIENT),
            entry("GET /api/v1/bank-accounts/trading-account", CLIENT),
            entry("POST /api/v1/bank-accounts/deposit", CLIENT),
            entry("POST /api/v1/bank-accounts/withdraw", CLIENT),
            entry("GET /api/v1/me/accounts", CLIENT),
            entry("POST /api/v1/me/accounts", CLIENT),
            entry("GET /api/v1/me/disputes", CLIENT),
            entry("POST /api/v1/me/disputes", CLIENT),
            entry("GET /api/v1/admin/disputes", ADMIN),
            entry("PUT /api/v1/me/watchlist/{symbol}", CLIENT),
            entry("DELETE /api/v1/me/watchlist/{symbol}", CLIENT),
            // Admin commands, called by internal-backend with the admin's own token.
            entry("POST /api/v1/admin/accounts/{id}/suspend", ADMIN),
            entry("POST /api/v1/admin/accounts/{id}/unsuspend", ADMIN),
            entry("POST /api/v1/admin/instruments/{id}/suspend", ADMIN),
            entry("POST /api/v1/admin/instruments/{id}/unsuspend", ADMIN));

    @Autowired private MockMvc mvc;
    @Autowired private ApplicationContext context;
    @Autowired private JdbcTemplate jdbc;

    @MockitoBean private UserProvisioningService provisioning;
    @MockitoBean private PricingApiClient pricing;

    @Value("${jwt.shared-secret}") private String secret;
    @Value("${jwt.issuer}") private String issuer;
    @Value("${jwt.audience}") private String audience;

    // One caller per role. JUnit makes a new instance per test, so the ids never repeat.
    private final Map<String, UUID> callers = Map.of(
            "CLIENT", UUID.randomUUID(), "ANALYST", UUID.randomUUID(),
            "ADMIN", UUID.randomUUID(), "SUPER_ADMIN", UUID.randomUUID());

    @BeforeEach
    void setUp() {
        // 1. Provisioning is mocked, so give the client the users row it would have created
        //    (the watchlist endpoints load it).
        UUID client = callers.get("CLIENT");
        jdbc.update("insert into users (user_id, email, role, created_at) values (?, ?, 'client', CURRENT_TIMESTAMP)",
                client, client + "@example.com");
        // 2. A quote for the quote endpoints, so they answer without calling Fauxnance.
        when(pricing.getQuote("AAPL")).thenReturn(new QuoteResponse("AAPL", new BigDecimal("50"), new BigDecimal("49.9"),
                new BigDecimal("50.1"), null, "USD", null, null, null, Instant.now(), "OPEN", false, "test"));
    }

    @Test
    void theServedEndpoints_areExactlyTheAccessMatrix() {
        // Sorted on both sides, so a failure shows the added or missing lines next to each other.
        assertEquals(new TreeSet<>(ACCESS.keySet()), servedEndpoints(),
                "Every endpoint needs a row in ACCESS and a URL rule in SecurityConfig");
    }

    @TestFactory
    Stream<DynamicTest> everyEndpoint_admitsOnlyItsRoles() {
        // One test per row, named after the endpoint, so a failure says which one.
        return ACCESS.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(row -> DynamicTest.dynamicTest(row.getKey(), () -> checkAccess(row.getKey(), row.getValue())));
    }

    // Sends one request per caller to a single endpoint and collects every wrong status.
    private void checkAccess(String endpoint, Set<String> allowed) throws Exception {
        String method = endpoint.substring(0, endpoint.indexOf(' '));
        String url = concrete(endpoint.substring(endpoint.indexOf(' ') + 1));
        List<String> wrong = new ArrayList<>();

        // 1. No token: authentication fails before any rule is checked.
        int anonymous = send(method, url, null);
        if (anonymous != 401) wrong.add("no token: expected 401, got " + anonymous);

        for (String role : ROLES) {
            int status = send(method, url, token(callers.get(role), role));
            // 2. A role in the row gets past security; whatever the controller then answers is fine.
            if (allowed.contains(role) && (status == 401 || status == 403)) {
                wrong.add(role + ": expected to get past security, got " + status);
            }
            // 3. Any other role is refused by the URL rules.
            if (!allowed.contains(role) && status != 403) {
                wrong.add(role + ": expected 403, got " + status);
            }
        }
        assertTrue(wrong.isEmpty(), method + " " + url + "\n  " + String.join("\n  ", wrong));
    }

    // Every "METHOD path" our controllers registered. springdoc's and Spring Boot's own controllers
    // (/v3/api-docs, /error) are left out; SecurityChainTest covers their rules.
    private Set<String> servedEndpoints() {
        Set<String> served = new TreeSet<>();
        for (RequestMappingHandlerMapping mapping : context.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            mapping.getHandlerMethods().forEach((info, handler) -> {
                if (!handler.getBeanType().getPackageName().startsWith("com.avengers.endgame")) {
                    return;
                }
                Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
                for (String path : info.getPatternValues()) {
                    // A mapping with no method answers every method; list it as ANY so it can't hide.
                    if (methods.isEmpty()) {
                        served.add("ANY " + path);
                    }
                    methods.forEach(method -> served.add(method.name() + " " + path));
                }
            });
        }
        return served;
    }

    // Fills in path variables: ids ({orderId}, {bankAccountId}, ...) get a random UUID, anything else gets AAPL.
    private static String concrete(String path) {
        return path.replaceAll("\\{[^}]*[iI]d}", UUID.randomUUID().toString())
                .replaceAll("\\{[^}]*}", "AAPL");
    }

    // One request, the way the frontend sends it. Requests that take a body get an empty JSON object.
    private int send(String method, String url, String token) throws Exception {
        MockHttpServletRequestBuilder request = request(HttpMethod.valueOf(method.equals("ANY") ? "GET" : method), url);
        if (Set.of("POST", "PUT", "PATCH").contains(method)) {
            request.contentType(MediaType.APPLICATION_JSON).content("{}");
        }
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    // A valid token shaped like auth-server's: correct secret, issuer and audience, expiring in 15 minutes.
    private String token(UUID sub, String role) {
        SecretKeySpec key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(sub.toString())
                .claim("amr", List.of("pwd", "mfa"))
                .claim("email", sub + "@example.com")
                .claim("roles", List.of(role))
                .issuer(issuer)
                .audience(List.of(audience))
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plus(15, MINUTES))
                .build();
        return NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build()
                .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }
}
