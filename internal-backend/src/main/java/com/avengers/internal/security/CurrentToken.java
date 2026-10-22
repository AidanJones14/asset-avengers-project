package com.avengers.internal.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

// Owner: security layer. The only code outside Spring Security that reads the security context.
// Used by TradingAdminClient to forward the admin's own token to the trading backend, which
// verifies it again (aud endgame-api, ADMIN/SUPER_ADMIN URL rule) and records the command itself.
public final class CurrentToken {
    private CurrentToken() {}

    public static String value() {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken jwt) {
            return jwt.getToken().getTokenValue();
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
    }
}
