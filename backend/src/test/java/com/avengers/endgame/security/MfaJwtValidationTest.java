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
        var claims=JwtClaimsSet.builder().subject("test-client").issuer("endgame-auth")
            .audience(List.of("endgame-api")).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        if(methods!=null)claims.claim("amr",methods);
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
}
