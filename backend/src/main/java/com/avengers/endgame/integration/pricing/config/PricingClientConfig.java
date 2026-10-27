package com.avengers.endgame.integration.pricing.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class PricingClientConfig {

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }

    // The JDK HttpClient has no read timeout by default; a provider that accepts the connection and
    // never answers would hang the caller forever. A timeout surfaces as PricingApiException (502).
    @Bean
    public RestClient pricingRestClient(PricingApiProperties pricingApiProperties) {
        var http = HttpClient.newBuilder().connectTimeout(pricingApiProperties.getConnectTimeout()).build();
        var requestFactory = new JdkClientHttpRequestFactory(http);
        requestFactory.setReadTimeout(pricingApiProperties.getReadTimeout());
        return RestClient.builder()
                .requestFactory(requestFactory)
                .baseUrl(pricingApiProperties.getBaseUrl())
                .defaultHeader("X-Api-Key", pricingApiProperties.getKey())
                .build();
    }
}


