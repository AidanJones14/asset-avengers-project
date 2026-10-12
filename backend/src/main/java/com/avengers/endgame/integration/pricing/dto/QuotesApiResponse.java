package com.avengers.endgame.integration.pricing.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public record QuotesApiResponse(Data data, Meta meta) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Data(
            String symbol,
            BigDecimal price,
            BigDecimal bid,
            BigDecimal ask,
            BigDecimal spreadBps,
            String currency,
            BigDecimal change,
            BigDecimal changePercent,
            BigDecimal previousClose,
            String asOf,
            String marketState
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Meta(
            String asOf,
            String disclaimer,
            String symbol,
            String source,
            Boolean stale,
            String spreadSource
    ) {
    }
}

