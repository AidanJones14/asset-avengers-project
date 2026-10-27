package com.avengers.endgame.integration.pricing.config;

import java.time.Duration;
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
    // Bound every provider call: order submission waits for a fresh quote while it holds the
    // caller's user and account row locks, so a hung call would freeze all of that client's requests.
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(5);

}


