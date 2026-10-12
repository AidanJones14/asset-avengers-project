package com.avengers.endgame.integration.pricing.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class PricingClientConfig {

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }

    @Bean
    public RestClient pricingRestClient(PricingApiProperties pricingApiProperties) {
        return RestClient.builder()
                .baseUrl(pricingApiProperties.getBaseUrl())
                .defaultHeader("X-Api-Key", pricingApiProperties.getKey())
                .build();
    }
}


