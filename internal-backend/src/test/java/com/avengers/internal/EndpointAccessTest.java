package com.avengers.internal;

import com.avengers.internal.admin.TradingAdminClient;
import com.avengers.internal.analytics.SupersetGateway;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Stream;

import static java.util.Map.entry;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

// Owner: security layer (tests). The access matrix for every endpoint this staff service serves,
// copied from the trading backend's EndpointAccessTest (staff-security plan 5.5).
//   1. The endpoints Spring serves are exactly the rows of ACCESS: a new endpoint fails here until it
//      gets a row (and StaffSecurityConfig gives it a URL rule).
//   2. Per row, with real HS256 tokens shaped like auth-server's: no token -> 401, a client token -> 401
//      (no staff audience), staff roles not in the row -> 403, roles in the row get past security.
// Mocks keep the controllers off the network and database; their answers don't matter here.
@SpringBootTest(classes = InternalApplication.class, properties = {
        "JWT_SECRET=" + EndpointAccessTest.SECRET,
        "ADMIN_DB_URL=jdbc:h2:mem:endpoint-access", "ADMIN_DB_USERNAME=sa", "ADMIN_DB_PASSWORD=",
        "spring.datasource.driver-class-name=org.h2.Driver"})
@AutoConfigureMockMvc
class EndpointAccessTest {
    static final String SECRET = "endpoint-access-test-secret-at-least-32-characters";
    private static final List<String> ROLES = List.of("CLIENT", "ANALYST", "ADMIN", "SUPER_ADMIN");
    private static final Set<String> ADMIN = Set.of("ADMIN", "SUPER_ADMIN");
    private static final Set<String> STAFF = Set.of("ANALYST", "ADMIN", "SUPER_ADMIN");

    // "METHOD path" exactly as the controller maps it -> the roles allowed to call it.
    private static final Map<String, Set<String>> ACCESS = Map.ofEntries(
            entry("GET /api/v1/admin/clients/suggestions", ADMIN),
            entry("GET /api/v1/admin/clients", ADMIN),
            entry("GET /api/v1/admin/accounts/{accountId}", ADMIN),
            entry("POST /api/v1/admin/accounts/{accountId}/suspend", ADMIN),
            entry("POST /api/v1/admin/accounts/{accountId}/unsuspend", ADMIN),
            entry("GET /api/v1/admin/orders", ADMIN),
            entry("GET /api/v1/admin/orders/{orderId}/lifecycle", ADMIN),
            entry("POST /api/v1/admin/instruments/{instrumentId}/suspend", ADMIN),
            entry("POST /api/v1/admin/instruments/{instrumentId}/unsuspend", ADMIN),
            entry("GET /api/v1/admin/audit-log", ADMIN),
            entry("GET /api/v1/admin/orders/{id}/timeline", ADMIN),
            entry("GET /api/v1/admin/orders/{id}/pricing", ADMIN),
            entry("GET /api/v1/admin/orders/{id}/export", ADMIN),
            entry("GET /api/v1/admin/trades", ADMIN),
            entry("GET /api/v1/admin/disputes", ADMIN),
            entry("GET /api/v1/admin/orders/{id}/pdf", ADMIN),
            entry("GET /api/v1/admin/audit-log/pdf", ADMIN),
            entry("GET /api/v1/analytics/reports/{day}/pdf", STAFF),
            entry("POST /api/v1/analytics/report-requests", STAFF),
            entry("GET /api/v1/analytics/status", STAFF),
            entry("GET /api/v1/analytics/workspace", STAFF),
            entry("GET /api/v1/analytics/dashboards", STAFF),
            entry("POST /api/v1/analytics/dashboards/{key}/guest-token", STAFF),
            entry("GET /api/v1/analytics/clients/suggestions", STAFF),
            entry("GET /api/v1/analytics/clients/{id}/activity", STAFF),
            entry("GET /api/v1/analytics/clients/portfolios", STAFF),
            entry("GET /api/v1/analytics/clients/{id}/accounts", STAFF),
            entry("GET /api/v1/analytics/report-schedule", STAFF),
            entry("PUT /api/v1/analytics/report-schedule", STAFF));

    @Autowired private MockMvc mvc;
    @Autowired private ApplicationContext context;
    @MockitoBean private NamedParameterJdbcTemplate jdbc;
    @MockitoBean private SupersetGateway superset;
    @MockitoBean private TradingAdminClient trading;

    @Test
    void theServedEndpoints_areExactlyTheAccessMatrix() {
        assertEquals(new TreeSet<>(ACCESS.keySet()), servedEndpoints(),
                "Every endpoint needs a row in ACCESS and a URL rule in StaffSecurityConfig");
    }

    @TestFactory
    Stream<DynamicTest> everyEndpoint_admitsOnlyItsRoles() {
        return ACCESS.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(row -> DynamicTest.dynamicTest(row.getKey(), () -> checkAccess(row.getKey(), row.getValue())));
    }

    private void checkAccess(String endpoint, Set<String> allowed) throws Exception {
        String method = endpoint.substring(0, endpoint.indexOf(' '));
        String url = endpoint.substring(endpoint.indexOf(' ') + 1)
                .replaceAll("\\{[^}]*[iI]d}", UUID.randomUUID().toString())
                .replace("{day}", "2026-10-01").replace("{key}", "business-overview");
        List<String> wrong = new ArrayList<>();
        int anonymous = send(method, url, null);
        if (anonymous != 401) wrong.add("no token: expected 401, got " + anonymous);
        for (String role : ROLES) {
            int status = send(method, url, token(role, STAFF.contains(role)));
            if (allowed.contains(role) && (status == 401 || status == 403)) wrong.add(role + ": expected to get past security, got " + status);
            // A real client token has no staff audience, so the decoder refuses it before any URL rule (401).
            if (role.equals("CLIENT") && status != 401) wrong.add("CLIENT: expected 401 (not a staff token), got " + status);
            if (!allowed.contains(role) && !role.equals("CLIENT") && status != 403) wrong.add(role + ": expected 403, got " + status);
        }
        // Defence in depth: even a CLIENT token that did carry the staff audience is refused by the URL rules.
        int forged = send(method, url, token("CLIENT", true));
        if (forged != 403) wrong.add("CLIENT with staff audience: expected 403, got " + forged);
        assertTrue(wrong.isEmpty(), method + " " + url + "\n  " + String.join("\n  ", wrong));
    }

    private Set<String> servedEndpoints() {
        Set<String> served = new TreeSet<>();
        for (RequestMappingHandlerMapping mapping : context.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            mapping.getHandlerMethods().forEach((info, handler) -> {
                if (!handler.getBeanType().getPackageName().startsWith("com.avengers.internal")) return;
                Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
                for (String path : info.getPatternValues()) {
                    if (methods.isEmpty()) served.add("ANY " + path);
                    methods.forEach(m -> served.add(m.name() + " " + path));
                }
            });
        }
        return served;
    }

    private int send(String method, String url, String token) throws Exception {
        var request = request(HttpMethod.valueOf(method), url);
        if (Set.of("POST", "PUT").contains(method)) request.contentType(MediaType.APPLICATION_JSON).content("{}");
        if (token != null) request.header("Authorization", "Bearer " + token);
        try {
            return mvc.perform(request).andReturn().getResponse().getStatus();
        } catch (jakarta.servlet.ServletException reachedController) {
            // The mocks return null, so a controller can throw; MockMvc rethrows instead of answering 500.
            // Security never throws like this (it answers 401/403), so the request got past it.
            return 500;
        }
    }

    // Shaped like auth-server's tokens after an MFA login; only staff tokens carry the staff audience.
    private String token(String role, boolean staffAudience) {
        var audience = staffAudience ? List.of("endgame-api", "endgame-auth", "endgame-staff") : List.of("endgame-api", "endgame-auth");
        var claims = JwtClaimsSet.builder().subject(UUID.randomUUID().toString()).issuer("endgame-auth")
                .audience(audience).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300))
                .claim("amr", List.of("pwd", "mfa")).claim("roles", List.of(role)).claim("email", role.toLowerCase() + "@example.com").build();
        return new NimbusJwtEncoder(new ImmutableSecret<>(SECRET.getBytes(StandardCharsets.UTF_8)))
                .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
