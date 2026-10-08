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

@Service
public class OrderQuoteService {

    private final InstrumentRepository instrumentRepository;
    private final PricingApiClient pricingApiClient;

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
}

