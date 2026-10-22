package com.avengers.internal.security;

import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtAudienceValidator;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

// Owner: security layer. Same flow as the trading backend's SecurityConfig (local/spring-auth-flows.md):
//   1. jwtDecoder: is the token genuine, unexpired, from auth-server, for THIS service, with MFA proof?
//   2. staffEndpoints: may this role call this URL? (allow list; anything unlisted is denied)
// After both pass, controllers learn who is calling only through @CurrentUserId / @CurrentActor.
@Configuration
public class StaffSecurityConfig {
    // Role names as auth-server issues them (access-policy.ts). EndpointAccessTest keeps its own lists.
    private static final String[] ADMIN_ROLES = {"ADMIN", "SUPER_ADMIN"};
    private static final String[] STAFF_ROLES = {"ANALYST", "ADMIN", "SUPER_ADMIN"};

    // application.properties: jwt.shared-secret=${JWT_SECRET} (no default), jwt.issuer, jwt.audience.
    @Value("${jwt.shared-secret}") private String sharedSecret;
    @Value("${jwt.issuer}") private String issuer;
    // "endgame-staff": auth-server only puts it in ANALYST/ADMIN/SUPER_ADMIN tokens, so a client token
    // (aud endgame-api + endgame-auth) is refused here even though it's signed with the same secret.
    @Value("${jwt.audience}") private String audience;

    @Bean
    JwtDecoder jwtDecoder() {
        // 1. HS256 with the shared secret's UTF-8 bytes, like auth-server signs.
        var key = new SecretKeySpec(sharedSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        var decoder = NimbusJwtDecoder.withSecretKey(key).build();
        // 2. createDefaultWithValidators keeps Spring's expiry checks and adds ours.
        decoder.setJwtValidator(JwtValidators.createDefaultWithValidators(
                new JwtIssuerValidator(issuer),
                new JwtAudienceValidator(audience),
                // 3. MFA proof: this service only serves staff, and staff always need MFA, so no
                //    client exception here (auth-server's access-policy.ts gives the same answer).
                new JwtClaimValidator<List<String>>("amr", methods -> methods != null && methods.contains("pwd") && methods.contains("mfa")),
                // 4. sub must be a UUID (auth-server's user id), so @CurrentUserId / @CurrentActor never
                //    fail with a 500 later: a malformed identity is a 401 here, for every endpoint.
                new JwtClaimValidator<String>("sub", StaffSecurityConfig::isUuid)));
        return decoder;
    }

    private static boolean isUuid(String value) {
        try { UUID.fromString(value); return true; } catch (RuntimeException notAUuid) { return false; }
    }

    @Bean
    SecurityFilterChain staffEndpoints(HttpSecurity http) throws Exception {
        // The "roles" claim becomes ROLE_ authorities, which hasAnyRole(...) below checks.
        var roles = new JwtGrantedAuthoritiesConverter();
        roles.setAuthoritiesClaimName("roles");
        roles.setAuthorityPrefix("ROLE_");
        var authentication = new JwtAuthenticationConverter();
        authentication.setJwtGrantedAuthoritiesConverter(roles);

        return http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Allow list, first match wins. Staff data is cross-client by design, so the URL rule is
                // the whole permission check. SUPER_ADMIN has an admin's access everywhere.
                .authorizeHttpRequests(access -> access
                        // Spring Boot re-dispatches unhandled errors to /error; let those through so a real
                        // 400/404/500 isn't turned into a 403 (same rule as the trading backend).
                        .dispatcherTypeMatchers(DispatcherType.FORWARD, DispatcherType.ERROR).permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAnyRole(ADMIN_ROLES)
                        .requestMatchers("/api/v1/analytics/**").hasAnyRole(STAFF_ROLES)
                        .anyRequest().denyAll())
                .oauth2ResourceServer(server -> server.jwt(jwt -> jwt.jwtAuthenticationConverter(authentication)))
                .build();
    }
}
