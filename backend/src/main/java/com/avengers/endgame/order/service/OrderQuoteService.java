package com.avengers.endgame.order.service;

import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.integration.pricing.client.PricingApiClient;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.integration.pricing.exception.PricingApiException;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.UUID;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;

@Service
public class OrderQuoteService {

    private final InstrumentRepository instrumentRepository;
    private final PricingApiClient pricingApiClient;

    @Value("${pricing.api.max-quote-age:PT1M}")
    private Duration maxQuoteAge = Duration.ofMinutes(1);

    public OrderQuoteService(InstrumentRepository instrumentRepository, PricingApiClient pricingApiClient) {
        this.instrumentRepository = instrumentRepository;
        this.pricingApiClient = pricingApiClient;
    }

    public QuoteResponse getQuoteForInstrument(UUID instrumentId) {
        Instrument instrument = instrumentRepository.findById(instrumentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Instrument with ID " + instrumentId + " not found"));

        if (!instrument.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Instrument " + instrument.getSymbol() + " is not tradable");
        }

        try {
            return pricingApiClient.getQuote(instrument.getSymbol());
        } catch (PricingApiException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve pricing for symbol " + instrument.getSymbol(), ex);
        }
    }

    public QuoteResponse getCurrentQuoteForInstrument(UUID instrumentId) {
        QuoteResponse quote = getQuoteForInstrument(instrumentId);
        Instant now = Instant.now();
        if (quote == null || !Boolean.FALSE.equals(quote.stale()) || quote.asOf() == null
                || quote.asOf().isBefore(now.minus(maxQuoteAge))
                || quote.asOf().isAfter(now.plusSeconds(5))) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "A current, non-stale market quote is required");
        }
        return quote;
    }

    public QuoteResponse getQuoteForSymbol(String symbol) {
        if (symbol == null || symbol.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Symbol cannot be empty");
        }

        try {
            return pricingApiClient.getQuote(symbol.toUpperCase());
        } catch (PricingApiException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve pricing for symbol " + symbol, ex);
        }
    }
}
