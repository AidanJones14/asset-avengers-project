package com.avengers.endgame.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;

/** Real signature/claim validation, rather than the mock-jwt authorization shortcut. */
class MfaJwtValidationTest {
    private static final String SECRET="mandatory-mfa-test-secret-at-least-32-characters";
    private JwtDecoder decoder() {
        var config=new SecurityConfig();
        ReflectionTestUtils.setField(config,"sharedSecret",SECRET);
        ReflectionTestUtils.setField(config,"issuer","endgame-auth");
        ReflectionTestUtils.setField(config,"audience","endgame-api");
        return config.jwtDecoder();
    }
    private String token(List<String> methods) {
        return token(methods, null, List.of("CLIENT"));
    }
    private String token(List<String> methods, Boolean required, List<String> roles) {
        var claims=JwtClaimsSet.builder().subject("test-client").issuer("endgame-auth")
            .audience(List.of("endgame-api")).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if(methods!=null)claims.claim("amr",methods);
        if(required!=null)claims.claim("mfa_required",required);
        claims.claim("roles",roles);
        var encoder=new NimbusJwtEncoder(new ImmutableSecret<>(SECRET.getBytes(StandardCharsets.UTF_8)));
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims.build())).getTokenValue();
    }
    @Test void rejectsLegacyAndPasswordOnlyTokens() {
        assertThrows(JwtValidationException.class,()->decoder().decode(token(null)));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"))));
    }
    @Test void acceptsSignedPasswordAndMfaProof() {
        assertEquals("test-client",decoder().decode(token(List.of("pwd","mfa"))).getSubject());
    }
    @Test void acceptsExplicitPasswordOnlyClientPolicy() {
        assertEquals("test-client",decoder().decode(token(List.of("pwd"),false,List.of("CLIENT"))).getSubject());
    }
    @Test void rejectsPasswordOnlyStaffAndRequiredAccounts() {
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),true,List.of("CLIENT"))));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),false,List.of("ADMIN"))));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),false,List.of("CLIENT","ANALYST"))));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of(),false,List.of("CLIENT"))));
    }

}
