package com.avengers.internal.analytics;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

// Only approved dashboard keys can be exchanged for short-lived guest tokens.
// Service credentials and the Superset CSRF session stay on this server.
@Service
public class SupersetGateway {
    private static final Set<String> ALLOWED = Set.of(
            "business-overview", "instrument-activity", "client-activity");
    private final NamedParameterJdbcTemplate jdbc;
    private final RestClient client;
    private final String username;
    private final String password;
    private final String publicUrl;
    private final int publicPort;

    public SupersetGateway(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc,
                           @Value("${superset.base-url:http://superset:8088}") String baseUrl,
                           @Value("${superset.public-url:http://localhost:8088}") String publicUrl,
                           @Value("${superset.username:internal-api}") String username,
                           @Value("${superset.password:}") String password,
                           @Value("${superset.public-port:8088}") int publicPort) {
        this.jdbc = jdbc;
        this.username = username;
        this.password = password;
        this.publicUrl = publicUrl;
        this.publicPort = publicPort;
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        client = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    // userId: the calling staff member (from the controller's @CurrentUserId), Superset's guest user name.
    public Map<String, Object> guestToken(String key, java.util.UUID userId) {
        if (!ALLOWED.contains(key)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown dashboard");
        }
        var dashboards = jdbc.queryForList(
                "SELECT embedded_id FROM integration.dashboard_registry WHERE dashboard_key=:key",
                Map.of("key", key));
        if (dashboards.isEmpty() || password.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dashboard setup is not complete");
        }
        String dashboard = String.valueOf(dashboards.getFirst().get("embedded_id"));
        try {
            var login = client.post().uri("/api/v1/security/login")
                    .body(Map.of("username", username, "password", password, "provider", "db", "refresh", false))
                    .retrieve().body(Map.class);
            if (login == null || !(login.get("access_token") instanceof String access)) {
                throw new IllegalStateException("Missing access token");
            }

            // Superset also requires CSRF for the authenticated guest-token POST.
            // Keep this request's session local, so concurrent callers cannot mix cookies.
            var csrf = client.get().uri("/api/v1/security/csrf_token/")
                    .headers(headers -> headers.setBearerAuth(access))
                    .retrieve().toEntity(Map.class);
            if (csrf.getBody() == null || !(csrf.getBody().get("result") instanceof String csrfToken)) {
                throw new IllegalStateException("Missing CSRF token");
            }
            List<String> cookies = csrf.getHeaders().getOrEmpty("Set-Cookie");
            String cookieHeader = cookies.stream().map(cookie -> cookie.split(";", 2)[0])
                    .collect(Collectors.joining("; "));
            var guest = client.post().uri("/api/v1/security/guest_token/")
                    .headers(headers -> {
                        headers.setBearerAuth(access);
                        headers.set("X-CSRFToken", csrfToken);
                        headers.set("Cookie", cookieHeader);
                    })
                    .body(Map.of("user", Map.of("username", userId.toString()),
                            "resources", List.of(Map.of("type", "dashboard", "id", dashboard)),
                            "rls", List.of()))
                    .retrieve().body(Map.class);
            if (guest == null || !(guest.get("token") instanceof String token)) {
                throw new IllegalStateException("Missing guest token");
            }
            return Map.of("guestToken", token, "dashboardId", dashboard, "supersetUrl", "auto".equalsIgnoreCase(publicUrl)
                    ? org.springframework.web.servlet.support.ServletUriComponentsBuilder.fromCurrentRequest()
                        .replacePath("").replaceQuery(null).port(publicPort).build().toUriString()
                    : publicUrl);
        } catch (RestClientException | IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Superset is temporarily unavailable");
        }
    }
}
