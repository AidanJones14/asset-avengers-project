package com.avengers.endgame.order.service;

import com.avengers.endgame.instrument.Instrument;
import com.avengers.endgame.instrument.InstrumentRepository;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.avengers.endgame.integration.pricing.exception.PricingApiException;
import com.avengers.endgame.integration.pricing.exception.PricingRateLimitException;
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
        } catch (PricingRateLimitException ex) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage(), ex);
        } catch (PricingApiException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve pricing for symbol " + instrument.getSymbol(), ex);
        }
    }

    public QuoteResponse getCurrentQuoteForInstrument(UUID instrumentId) {
        // Submission and execution share the latest available validated observation.
        // Old saved prices remain usable under this simulator's policy.
        QuoteResponse quote = quoteForInstrument(instrumentId, true);
        Instant now = Instant.now();
        if (quote == null || quote.asOf() == null
                || quote.asOf().isAfter(now.plusSeconds(5))) {
            throw new QuoteValidationException("The pricing provider returned a missing or invalid quote timestamp", quote);
        }
        if (quote.price() == null || quote.price().signum() <= 0) {
            throw new QuoteValidationException("The pricing provider returned a missing or invalid price", quote);
        }
        return quote;
    }

    public QuoteResponse getQuoteForSymbol(String symbol) { return getQuoteForSymbol(symbol, false); }

    public QuoteResponse getQuoteForSymbol(String symbol, boolean interactive) {
        if (symbol == null || symbol.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Symbol cannot be empty");
        }

        try {
            return interactive ? cache.search(symbol) : cache.display(symbol);
        } catch (PricingRateLimitException ex) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage(), ex);
        } catch (PricingApiException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Unable to retrieve pricing for symbol " + symbol, ex);
        }
    }
}
