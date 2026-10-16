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

@Service
public class OrderQuoteService {

    private final InstrumentRepository instrumentRepository;
    private final QuoteCache cache;

    public OrderQuoteService(InstrumentRepository instrumentRepository, QuoteCache cache) {
        this.instrumentRepository = instrumentRepository;
        this.cache = cache;
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
        // Fetch from the provider for every submission and execution. Outside market hours,
        // its latest valid quote can retain the last trading session timestamp.
        QuoteResponse quote = quoteForInstrument(instrumentId, true);
        Instant now = Instant.now();
        // The simulator accepts the provider's latest cached/closing quote, even when
        // marked stale. Fetching again is mandatory; timestamp and price checks still apply.
        if (quote == null || quote.asOf() == null
                || quote.asOf().isAfter(now.plusSeconds(5))) {
            throw new QuoteValidationException("The pricing provider returned a missing or invalid quote timestamp", quote);
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
