package com.avengers.endgame.instrument;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;
    private final InstrumentMapper instrumentMapper;
    private final com.avengers.endgame.order.service.QuoteCache quotes;

    public InstrumentService(InstrumentRepository instrumentRepository, InstrumentMapper instrumentMapper, com.avengers.endgame.order.service.QuoteCache quotes) {
        this.instrumentRepository = instrumentRepository;
        this.instrumentMapper = instrumentMapper;
        this.quotes = quotes;
    }

    public InstrumentResponseDto createInstrument(CreateInstrumentRequestDto request) {
        if (request.currency() != null && !request.currency().isBlank() && !"USD".equalsIgnoreCase(request.currency()))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Only USD instruments are supported");
        Instrument savedInstrument = instrumentRepository.save(instrumentMapper.toEntity(request));
        return instrumentMapper.toResponse(savedInstrument);
    }

    // A successfully discovered instrument remains in the catalogue even if the later order is rejected.
    @org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public InstrumentResponseDto getInstrumentBySymbol(String requested) {
        String symbol = requested == null ? "" : requested.trim().toUpperCase(java.util.Locale.ROOT);
        if (symbol.equals("BRK.B")) symbol = "BRK-B";
        if (!symbol.matches("(?:[A-Z0-9][A-Z0-9.\\^-]{0,19}|X:[A-Z0-9]+-USD)"))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Invalid stock ticker");
        var existing = instrumentRepository.findBySymbol(symbol);
        if (existing.isPresent()) {
            if (!"USD".equalsIgnoreCase(existing.get().getCurrency()))
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                        "Only USD instruments are supported");
            return instrumentMapper.toResponse(existing.get());
        }
        com.avengers.endgame.integration.pricing.dto.QuoteResponse quote;
        try { quote = quotes.search(symbol); }
        catch (com.avengers.endgame.integration.pricing.exception.PricingApiException error) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,
                    "Unable to verify pricing for ticker " + symbol, error);
        }
        if (quote == null || quote.symbol() == null || !symbol.equalsIgnoreCase(quote.symbol())
                || quote.price() == null || quote.price().signum() <= 0 || quote.currency() == null
                || !quote.currency().matches("[A-Za-z]{3}"))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,
                    "No valid instrument pricing found for " + symbol);
        if (!"USD".equalsIgnoreCase(quote.currency()))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Only USD instruments are supported");
        // The unique symbol and atomic insert make repeated/concurrent lookups idempotent.
        instrumentRepository.insertIfAbsent(UUID.randomUUID(), symbol, quote.currency().toUpperCase(java.util.Locale.ROOT));
        return instrumentMapper.toResponse(instrumentRepository.findBySymbol(symbol).orElseThrow());
    }

    public List<InstrumentResponseDto> getAllInstruments() {
        return instrumentRepository.findAll().stream()
                .filter(instrument -> "USD".equalsIgnoreCase(instrument.getCurrency()))
                .map(instrumentMapper::toResponse)
                .collect(Collectors.toList());
    }
}
