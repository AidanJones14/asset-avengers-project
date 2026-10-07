package com.avengers.endgame.integration.pricing.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record QuotesApiResponse(Data data, Meta meta) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Data(List<QuoteItem> quotes) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record QuoteItem(
            String symbol,
            String source,
            Boolean stale,
            QuoteDetails quote,
            ApiError error
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record QuoteDetails(
            String symbol,
            BigDecimal price,
            BigDecimal bid,
            BigDecimal ask,
            BigDecimal spreadBps,
            String currency,
            BigDecimal change,
            BigDecimal changePercent,
            BigDecimal previousClose,
            Instant asOf,
            String marketState
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ApiError(String code, String message, Map<String, Object> details) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Meta(Instant asOf, String disclaimer, String spreadSource) {
    }
}

