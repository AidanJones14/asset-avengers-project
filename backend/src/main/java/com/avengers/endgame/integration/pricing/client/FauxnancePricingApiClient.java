package com.avengers.endgame.integration.pricing.client;

import com.avengers.endgame.integration.pricing.config.PricingApiProperties;
import com.avengers.endgame.integration.pricing.dto.QuotesApiResponse;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.integration.pricing.exception.PricingApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Instant;

@Component
public class FauxnancePricingApiClient implements PricingApiClient {

    private static final Logger log = LoggerFactory.getLogger(FauxnancePricingApiClient.class);

    private final RestClient pricingRestClient;
    private final PricingApiProperties pricingApiProperties;
    private final ObjectMapper objectMapper;

    public FauxnancePricingApiClient(RestClient pricingRestClient,
                                     PricingApiProperties pricingApiProperties,
                                     ObjectMapper objectMapper) {
        this.pricingRestClient = pricingRestClient;
        this.pricingApiProperties = pricingApiProperties;
        this.objectMapper = objectMapper;
    }

    @Override
    public QuoteResponse getQuote(String symbol) {
        if (symbol == null || symbol.isBlank()) {
            throw new PricingApiException("Instrument symbol is required to fetch a quote");
        }
        if (pricingApiProperties.getKey() == null || pricingApiProperties.getKey().isBlank()) {
            throw new PricingApiException("Pricing API key is not configured");
        }

        log.info("Fetching Fauxnance quote for symbol '{}'", symbol);

        QuoteResponse quote;
        try {
            String requestPath = pricingApiProperties.getQuotesPath() + "/" + symbol;
            log.debug("Calling Fauxnance endpoint: {}{}", pricingApiProperties.getBaseUrl(), requestPath);

            String rawResponse = pricingRestClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path(pricingApiProperties.getQuotesPath())
                            .pathSegment(symbol)
                            .build())
                    .retrieve()
                    .body(String.class);

            log.info("Raw Fauxnance response for '{}': {}", symbol, rawResponse);

            if (rawResponse == null || rawResponse.isBlank()) {
                throw new PricingApiException("Pricing API returned an empty response");
            }

            QuotesApiResponse apiResponse = parseResponse(rawResponse);
            if (apiResponse.data() == null) {
                throw new PricingApiException("Pricing API returned a malformed quote response");
            }

            quote = new QuoteResponse(
                    firstNonBlank(apiResponse.data().symbol(), apiResponse.meta() != null ? apiResponse.meta().symbol() : null, symbol),
                    apiResponse.data().price(),
                    apiResponse.data().bid(),
                    apiResponse.data().ask(),
                    apiResponse.data().spreadBps(),
                    apiResponse.data().currency(),
                    apiResponse.data().change(),
                    apiResponse.data().changePercent(),
                    apiResponse.data().previousClose(),
                    parseInstant(apiResponse.data().asOf()),
                    apiResponse.data().marketState(),
                    apiResponse.meta() != null ? apiResponse.meta().stale() : null,
                    apiResponse.meta() != null ? apiResponse.meta().source() : null
            );
        } catch (RestClientException ex) {
            log.error("Fauxnance quote request failed for symbol '{}'", symbol, ex);
            throw new PricingApiException("Failed to fetch quotes from pricing API", ex);
        } catch (JsonProcessingException ex) {
            log.error("Fauxnance quote response could not be parsed for symbol '{}'", symbol, ex);
            throw new PricingApiException("Failed to parse quote response from pricing API", ex);
        }

        if (quote == null) {
            log.error("Fauxnance returned an empty quote response for symbol '{}'", symbol);
            throw new PricingApiException("Pricing API returned an empty response");
        }

        log.info("Received Fauxnance quote for symbol '{}': price={}, bid={}, ask={}, stale={}, source={}",
                quote.symbol(), quote.price(), quote.bid(), quote.ask(), quote.stale(), quote.source());

        return quote;
    }

    private QuotesApiResponse parseResponse(String rawResponse) throws JsonProcessingException {
        return objectMapper.readValue(rawResponse, QuotesApiResponse.class);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private Instant parseInstant(String value) {
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }
}

