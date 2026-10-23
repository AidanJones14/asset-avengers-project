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
import java.time.Instant;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;

@Service
public class OrderQuoteService {

    private final InstrumentRepository instrumentRepository;
    private final QuoteCache cache;
    private final Duration maxQuoteAge;

    public OrderQuoteService(InstrumentRepository instrumentRepository, QuoteCache cache,
                             @Value("${pricing.api.max-quote-age:PT10M}") Duration maxQuoteAge) {
        this.instrumentRepository = instrumentRepository;
        this.cache = cache;
        if (maxQuoteAge.isZero() || maxQuoteAge.isNegative()) throw new IllegalArgumentException("Quote maximum age must be positive");
        this.maxQuoteAge = maxQuoteAge;
    }

    public QuoteResponse getQuoteForInstrument(UUID instrumentId) { return quoteForInstrument(instrumentId, false); }

    private QuoteResponse quoteForInstrument(UUID instrumentId, boolean fresh) {
        Instrument instrument = instrumentRepository.findById(instrumentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Instrument with ID " + instrumentId + " not found"));

        if (!instrument.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Instrument " + instrument.getSymbol() + " is not tradable");
        }

        try {
            return fresh ? cache.fresh(instrument.getSymbol()) : cache.display(instrument.getSymbol());
        } catch (PricingApiException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve pricing for symbol " + instrument.getSymbol(), ex);
        }
    }

    public QuoteResponse getCurrentQuoteForInstrument(UUID instrumentId) {
        // A fresh provider request must also return a fresh observation.
        QuoteResponse quote = quoteForInstrument(instrumentId, true);
        Instant now = Instant.now();
        if (quote == null || quote.asOf() == null
                || quote.asOf().isAfter(now.plusSeconds(5))) {
            throw new QuoteValidationException("The pricing provider returned a missing or invalid quote timestamp", quote);
        }
        if (Boolean.TRUE.equals(quote.stale()) || quote.asOf().isBefore(now.minus(maxQuoteAge))) {
            throw new QuoteValidationException("Current market pricing is unavailable: quote is stale or too old. Try again when fresh pricing is available.", quote);
        }
        return quote;
    }

    public QuoteResponse getQuoteForSymbol(String symbol) {
        if (symbol == null || symbol.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Symbol cannot be empty");
        }

        try {
            return cache.display(symbol);
        } catch (PricingApiException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve pricing for symbol " + symbol, ex);
        }
    }
}
