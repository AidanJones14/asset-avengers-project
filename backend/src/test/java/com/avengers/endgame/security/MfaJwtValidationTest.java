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
    // A real auth-server user id: the decoder refuses a sub that isn't a UUID.
    private static final String SUB="00000000-0000-0000-0000-0000000000c1";
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
        return token(methods, required, roles, SUB);
    }
    private String token(List<String> methods, Boolean required, List<String> roles, String sub) {
        var claims=JwtClaimsSet.builder().subject(sub).issuer("endgame-auth")
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
        assertEquals(SUB,decoder().decode(token(List.of("pwd","mfa"))).getSubject());
    }
    @Test void acceptsExplicitPasswordOnlyClientPolicy() {
        assertEquals(SUB,decoder().decode(token(List.of("pwd"),false,List.of("CLIENT"))).getSubject());
    }
    @Test void rejectsPasswordOnlyStaffAndRequiredAccounts() {
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),true,List.of("CLIENT"))));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),false,List.of("ADMIN"))));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),false,List.of("CLIENT","ANALYST"))));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of(),false,List.of("CLIENT"))));
    }
    // Staff-security plan 3.1 / rule R: the only token allowed without "mfa" in amr is one whose roles
    // are EXACTLY ["CLIENT"] and whose mfa_required is false. Every other role list needs MFA, including
    // roles nobody remembered to list.
    @Test void rejectsPasswordOnlySuperAdminTokens() {
        // 1. CLIENT plus SUPER_ADMIN: contains CLIENT and neither ADMIN nor ANALYST, so the old
        //    "contains CLIENT and not a listed staff role" check let it through without MFA.
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),false,List.of("CLIENT","SUPER_ADMIN"))));
        // 2. SUPER_ADMIN alone: already refused before the fix (no CLIENT role); kept so the row
        //    stays covered if the rule is ever rewritten.
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd"),false,List.of("SUPER_ADMIN"))));
        // 3. Control: the same SUPER_ADMIN with MFA proof is accepted, so the rows above fail
        //    because of the missing "mfa", not because SUPER_ADMIN tokens are refused outright.
        assertEquals(SUB,decoder().decode(token(List.of("pwd","mfa"),true,List.of("SUPER_ADMIN"))).getSubject());
    }
    // Iteration 2 T2: a correctly signed token whose sub isn't a UUID is refused by the decoder (401),
    // instead of reaching UUID.fromString in UserProvisioningInterceptor / @CurrentUserId (500).
    @Test void rejectsASubThatIsNotAUuid() {
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd","mfa"),false,List.of("CLIENT"),"not-a-uuid")));
        assertThrows(JwtValidationException.class,()->decoder().decode(token(List.of("pwd","mfa"),false,List.of("CLIENT"),"")));
    }

}
