package com.avengers.endgame.integration.pricing.client;

import com.avengers.endgame.integration.pricing.config.PricingApiProperties;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.integration.pricing.dto.QuotesApiResponse;
import com.avengers.endgame.integration.pricing.exception.PricingApiException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class FauxnancePricingApiClient implements PricingApiClient {

    private final RestClient pricingRestClient;
    private final PricingApiProperties pricingApiProperties;

    public FauxnancePricingApiClient(RestClient pricingRestClient, PricingApiProperties pricingApiProperties) {
        this.pricingRestClient = pricingRestClient;
        this.pricingApiProperties = pricingApiProperties;
    }

    @Override
    public QuoteResponse getQuote(String symbol) {
        if (symbol == null || symbol.isBlank()) {
            throw new PricingApiException("Instrument symbol is required to fetch a quote");
        }
        if (pricingApiProperties.getKey() == null || pricingApiProperties.getKey().isBlank()) {
            throw new PricingApiException("Pricing API key is not configured");
        }

        QuotesApiResponse response;
        try {
            response = pricingRestClient.get()
                    .uri(pricingApiProperties.getQuotesPath())
                    .retrieve()
                    .body(QuotesApiResponse.class);
        } catch (RestClientException ex) {
            throw new PricingApiException("Failed to fetch quotes from pricing API", ex);
        }

        if (response == null || response.data() == null || response.data().quotes() == null) {
            throw new PricingApiException("Pricing API returned an empty response");
        }

        QuotesApiResponse.QuoteItem matchingQuote = response.data().quotes().stream()
                .filter(item -> item != null && symbol.equalsIgnoreCase(item.symbol()))
                .findFirst()
                .orElseThrow(() -> new PricingApiException("Quote not found for symbol: " + symbol));

        if (matchingQuote.error() != null) {
            throw new PricingApiException("Pricing API error for symbol " + symbol + ": " + matchingQuote.error().message());
        }
        if (matchingQuote.quote() == null) {
            throw new PricingApiException("Pricing API returned no quote payload for symbol: " + symbol);
        }

        QuotesApiResponse.QuoteDetails quote = matchingQuote.quote();
        return new QuoteResponse(
                quote.symbol(),
                quote.price(),
                quote.bid(),
                quote.ask(),
                quote.spreadBps(),
                quote.currency(),
                quote.change(),
                quote.changePercent(),
                quote.previousClose(),
                quote.asOf(),
                quote.marketState(),
                Boolean.TRUE.equals(matchingQuote.stale()),
                matchingQuote.source()
        );
    }
}

