package com.avengers.endgame.integration.pricing.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Setter
@Getter
@Component
@ConfigurationProperties(prefix = "pricing.api")
public class PricingApiProperties {

    private String baseUrl;
    private String key;
    private String quotesPath = "/v1/quotes";

}


