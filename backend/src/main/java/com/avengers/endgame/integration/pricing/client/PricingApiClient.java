package com.avengers.endgame.integration.pricing.client;

import com.avengers.endgame.integration.pricing.dto.QuoteResponse;

public interface PricingApiClient {
    QuoteResponse getQuote(String symbol);
}

