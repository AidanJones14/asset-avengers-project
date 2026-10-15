package com.avengers.internal;

import com.avengers.internal.analytics.SupersetGateway;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes=InternalApplication.class,properties={
    "JWT_SECRET=internal-security-test-secret-at-least-32-characters",
    "ADMIN_DB_URL=jdbc:h2:mem:internal-security","ADMIN_DB_USERNAME=sa","ADMIN_DB_PASSWORD=",
    "spring.datasource.driver-class-name=org.h2.Driver"})
@AutoConfigureMockMvc
class InternalSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired ApplicationContext context;
    @MockitoBean NamedParameterJdbcTemplate jdbc;
    @MockitoBean SupersetGateway superset;

    @Test void aHeaderCannotImpersonateAnAdmin() throws Exception {
        mvc.perform(get("/api/v1/admin/trades").header("X-Admin-Id",UUID.randomUUID()))
            .andExpect(status().isUnauthorized());
    }
    @Test void clientCannotReadStaffData() throws Exception {
        mvc.perform(get("/api/v1/analytics/status").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CLIENT"))))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/trades").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CLIENT"))))
            .andExpect(status().isForbidden());
    }
    @Test void analystCanReadReportingButCannotUseAdminApi() throws Exception {
        mvc.perform(get("/api/v1/analytics/status").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ANALYST"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.reportingTimezone").value("America/New_York"));
        mvc.perform(get("/api/v1/admin/trades").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ANALYST"))))
            .andExpect(status().isForbidden());
    }
    @Test void authorizedDashboardRequestsUseTheGateway() throws Exception {
        when(superset.guestToken("business-overview")).thenReturn(Map.of("guestToken","test-token"));
        mvc.perform(post("/api/v1/analytics/dashboards/business-overview/guest-token")
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ANALYST"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.guestToken").value("test-token"));
    }
    @Test void rejectsWrongIssuerAndAudienceEvenWhenSignatureIsValid() throws Exception {
        mvc.perform(get("/api/v1/analytics/status").header("Authorization","Bearer "+token("wrong","endgame-api")))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/analytics/status").header("Authorization","Bearer "+token("endgame-auth","wrong")))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/analytics/status").header("Authorization","Bearer "+token("endgame-auth","endgame-api")))
            .andExpect(status().isOk());
    }
    @Test void reportScheduleCannotBeChangedByAClientOrAnonymousCaller() throws Exception {
        mvc.perform(put("/api/v1/analytics/report-schedule").contentType("application/json")
                .content("{\"localTime\":\"17:30\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/v1/analytics/report-schedule").contentType("application/json")
                .content("{\"localTime\":\"17:30\"}")
                .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CLIENT"))))
                .andExpect(status().isForbidden());
    }
    @Test void pdfExportsKeepStaffRoleBoundaries() throws Exception {
        mvc.perform(get("/api/v1/analytics/reports/2026-10-01/pdf"))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/analytics/reports/2026-10-01/pdf")
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CLIENT"))))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/audit-log/pdf?from=2026-10-01&to=2026-10-02")
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ANALYST"))))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/orders/"+UUID.randomUUID()+"/pdf")
            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ANALYST"))))
            .andExpect(status().isForbidden());
    }
    @Test void clientBackendAndJpaAreAbsentFromTheStaffClasspath() {
        // A separate source tree is not enough: the packaged service must also
        // exclude the client application's classes and persistence implementation.
        var loader = context.getClassLoader();
        assertNotNull(loader);
        assertNull(loader.getResource("com/avengers/endgame/EndgameApplication.class"));
        assertNull(loader.getResource("org/hibernate/Session.class"));
    }
    @Test void staffServiceDoesNotExposeClientTradingRoutes() throws Exception {
        mvc.perform(get("/api/v1/instruments").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
            .andExpect(status().isForbidden());
    }
    private String token(String issuer,String audience) {
        var encoder=new NimbusJwtEncoder(new ImmutableSecret<>("internal-security-test-secret-at-least-32-characters".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        var claims=JwtClaimsSet.builder().subject(UUID.randomUUID().toString()).issuer(issuer)
            .audience(List.of(audience)).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60))
            .claim("roles",List.of("ANALYST")).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
    }
}
