package com.avengers.endgame.security;

import com.avengers.endgame.user.UserProvisioningService;
import com.avengers.endgame.user.UserRole;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.UUID;

// Spring MVC calls preHandle function for every /api/v1/** request (registered in ProvisioningWebConfig)
// That's after the whole Spring Security filter chain has passed:
//      decoder checks the token, URL rules check the role, all before the controller
//      method and its @CurrentUserId argument. Rejected requests (401/403) never get here
// Why one hook instead of a call in each controller: no endpoint can forget to provision, scalable
// Apart from @CurrentUserId annotation, this is the only class outside SecurityConfig that reads token claims
// @Component makes this class a bean, so it can be injected into ProvisioningWebConfig
@Component
public class UserProvisioningInterceptor implements HandlerInterceptor {

    private final UserProvisioningService provisioning;

    // Constructor injection
    public UserProvisioningInterceptor(UserProvisioningService provisioning) {
        this.provisioning = provisioning;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // Ask Spring Security who it authenticated for this request.
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token) {
            // The validated token. Its claims (sub, email, roles) were set by auth-server.
            Jwt jwt = token.getToken();
            // Map the token's roles to the stored role via UserRole.
            // A token with no known role provisions nothing.
            // sub is the auth-server user id, which is also the users table's primary key.
            // If provisioning fails (when the DB is down or other issues), the exception stops the request here,
            // so a controller never runs without its user.
            UserRole.fromTokenRoles(jwt.getClaimAsStringList("roles")).ifPresent(role ->
                    provisioning.provision(UUID.fromString(jwt.getSubject()), jwt.getClaimAsString("email"), role));
        }
        // Never blocks: access was already decided by Spring Security, and exceptions already block
        // returning true means continue to the controller.
        return true;
    }
}
