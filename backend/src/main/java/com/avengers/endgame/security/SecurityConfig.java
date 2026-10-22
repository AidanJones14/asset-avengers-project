package com.avengers.endgame.security;

import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.oauth2.server.resource.OAuth2ResourceServerConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

// This config file is used by spring to set up security filters that decide whether a class makes it
// to the appropriate controller
// Both jwtDecoder and filterChain beans are used at startup for security config
// If the check fails due to the token being expired, misconfigured, the role is blocked for the endpoint,
// or the URL requested is not on the allow list
// The URL rules are the allow list, so new endpoints need to be added here to indicate who can call it
// After this, the UserProvisioningInterceptor ensures that the user exists in the transactional DB via upsert
@Configuration
public class SecurityConfig {
    // Role names as auth-server issues them (access-policy.ts). EndpointAccessTest keeps its own lists.
    private static final String[] ADMIN_ROLES = {"ADMIN", "SUPER_ADMIN"};

    // The secret auth-server signs tokens with (JWT_SECRET), read as UTF-8 bytes on both sides.
    // Mapped in application.properties. No default on purpose: the app won't start without it.
    @Value("${jwt.shared-secret}")
    private String sharedSecret;

    // The iss and aud values auth-server stamps on every token (JWT_ISSUER / JWT_AUDIENCE).
    @Value("${jwt.issuer}")
    private String issuer;

    @Value("${jwt.audience}")
    private String audience;

    @Bean
    public JwtDecoder jwtDecoder() {
        // 1. Turn the shared secret into an HMAC key. HS256 is withSecretKey's default algorithm,
        //    so tokens signed any other way (including "alg": "none") are rejected.
        SecretKeySpec key = new SecretKeySpec(
                sharedSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        NimbusJwtDecoder decoder =  NimbusJwtDecoder.withSecretKey(key).build();

        // Choose which claims to check. createDefaultWithValidators keeps Spring's default
        // Plain setJwtValidator(x) would replace the defaults, and expired tokens would get through.

        // iss must be auth-server's and aud must be this API. auth-server reads the same values from
        // the env.
        // A token made for another audience (Like Admin / Analyst Service) is
        // rejected here even though it's signed with the same secret.
        decoder.setJwtValidator(JwtValidators.createDefaultWithValidators(
                new JwtIssuerValidator(issuer),
                new JwtAudienceValidator(audience),
                // Signed policy permits password-only client sessions, never staff sessions.
                // Same rule as auth-server's access-policy.ts: amr needs "pwd", plus "mfa" unless roles
                // are exactly ["CLIENT"] and mfa_required is false. Whole-list compare, so
                // ["CLIENT","SUPER_ADMIN"] or any new role needs MFA.
                jwt -> {
                    var methods = jwt.getClaimAsStringList("amr");
                    var roles = jwt.getClaimAsStringList("roles");
                    boolean optionalClient = Boolean.FALSE.equals(jwt.getClaim("mfa_required"))
                            && List.of("CLIENT").equals(roles);
                    return methods != null && methods.contains("pwd")
                            && (methods.contains("mfa") || optionalClient)
                            ? org.springframework.security.oauth2.core.OAuth2TokenValidatorResult.success()
                            : org.springframework.security.oauth2.core.OAuth2TokenValidatorResult.failure(
                                new org.springframework.security.oauth2.core.OAuth2Error("invalid_token", "Required authentication proof is missing", null));
                },
                // sub must be a UUID (auth-server's user id). UserProvisioningInterceptor and @CurrentUserId
                // parse it later, where a malformed one was a 500; here it's a 401 for every endpoint.
                new JwtClaimValidator<String>("sub", SecurityConfig::isUuid)
        ));
        return decoder;
    }

    private static boolean isUuid(String value) {
        try { UUID.fromString(value); return true; } catch (RuntimeException notAUuid) { return false; }
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        // These convertersdeal with reading roles from JWT and converting to a spring authority
        // auth-server puts them in a "roles" claim (["CLIENT"])
        // Each one is given the ROLE_ prefix (ROLE_CLIENT),
        // which is what hasRole("CLIENT") below looks for by default
        JwtGrantedAuthoritiesConverter authoritiesConverter = new JwtGrantedAuthoritiesConverter();
        authoritiesConverter.setAuthoritiesClaimName("roles");
        authoritiesConverter.setAuthorityPrefix("ROLE_");

        // Attaches the converted spring authority role to the Authentication object for the request
        // that spring checks through filter chain
        JwtAuthenticationConverter authenticationConverter = new JwtAuthenticationConverter();
        authenticationConverter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);

        http
                // CSRF protects cookie-based logins, where the browser attaches credentials by itself.
                // A bearer token is only ever added deliberately by our frontend
                // so CSRF doesn't apply.
                .csrf(csrf -> csrf.disable())
                // Stateless: every request is judged only by its token.
                // Spring never creates a session
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Allow list
                // Checked top to bottom and only the first match applies, so specific paths must come
                // before the general ones that contain them.
                // "/**" also matches the bare path (e.g. /api/v1/instruments).
                .authorizeHttpRequests(auth -> auth
                        // Spring Security checks every dispatch, not only the original request.
                        // When an error isn't handled by our @RestControllerAdvice (right now: @Valid failures),
                        // Spring Boot re-dispatches the request to /error
                        // Without this rule, rule 8 would turn a real 400/404/500 into a 403.
                        .dispatcherTypeMatchers(DispatcherType.FORWARD, DispatcherType.ERROR).permitAll()
                        // API docs are public.
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // admin commands (tradingcontrol: suspend/unsuspend), called by internal-backend
                        // with the admin's own token. SUPER_ADMIN has an admin's access.
                        .requestMatchers("/api/v1/admin/**").hasAnyRole(ADMIN_ROLES)
                        // adding instruments is admin-only.
                        .requestMatchers(HttpMethod.POST, "/api/v1/instruments/**").hasAnyRole(ADMIN_ROLES)
                        // reading instruments is open to any signed-in role.
                        .requestMatchers(HttpMethod.GET, "/api/v1/instruments/**").authenticated()
                        // quotes live under /orders but are open to any signed-in role
                        // so this rule must come before the CLIENT-only /api/v1/orders/** rule below.
                        .requestMatchers("/api/v1/orders/quote/**").authenticated()
                        // client-owned data, only CLIENT tokens. Which rows each client can see is
                        //   decided in the services (owner-scoped lookups), not here.
                        .requestMatchers("/api/v1/me/**", "/api/v1/orders/**", "/api/v1/bank-accounts/**").hasRole("CLIENT")
                        // everything else is denied: 401 without a token, 403 with one. That includes
                        // unknown URLs (403, not 404: this runs before Spring MVC looks up the route) and
                        // endpoints nobody has given a rule. To open a new endpoint, add a rule above.
                        .anyRequest().denyAll())
                // Reads and checks the jwt bearer token header from the request with
                // jwtDecoder above, and turn it into an authenticated user with the
                // ROLE_ authorities from the converters
                .oauth2ResourceServer((OAuth2ResourceServerConfigurer<HttpSecurity> oauth2) ->
                        oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(authenticationConverter)));

        return http.build();
    }
}
