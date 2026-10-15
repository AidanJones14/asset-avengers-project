package com.avengers.internal.admin;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;
import java.util.UUID;

// Forward authorized changes to their owner. This service has no trading DB
// credentials, and the trading API independently verifies the forwarded JWT.
@Service
public class TradingAdminClient implements AdminCommands {
    private final RestClient client;
    public TradingAdminClient(@Value("${trading.base-url:http://backend:8082}") String url) {
        var factory=new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(15000);
        client=RestClient.builder().baseUrl(url).requestFactory(factory).build();
    }
    public AccountResponseDto setAccountSuspended(UUID id,boolean suspended,String reason,AdminActor actor) {
        return command("accounts",id,suspended,reason,AccountResponseDto.class);
    }
    public InstrumentResponseDto setInstrumentSuspended(UUID id,boolean suspended,String reason,AdminActor actor) {
        return command("instruments",id,suspended,reason,InstrumentResponseDto.class);
    }
    private <T> T command(String resource,UUID id,boolean suspended,String reason,Class<T> responseType) {
        var jwt=(JwtAuthenticationToken)SecurityContextHolder.getContext().getAuthentication();
        try {
            return client.post().uri("/api/v1/admin/"+resource+"/"+id+"/"+(suspended?"suspend":"unsuspend"))
                .headers(headers -> headers.setBearerAuth(jwt.getToken().getTokenValue()))
                .body(Map.of("reason",reason)).retrieve()
                .onStatus(status -> status.isError(),(request,response) -> {
                    var problem=new tools.jackson.databind.json.JsonMapper().readTree(response.getBody());
                    throw new ResponseStatusException(response.getStatusCode(),
                        problem==null?"Trading service rejected the command":problem.path("detail").asText("Trading service rejected the command"));
                }).body(responseType);
        } catch(ResourceAccessException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Trading service is unavailable");
        }
    }
}
