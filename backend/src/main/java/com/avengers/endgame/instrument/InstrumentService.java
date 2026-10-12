package com.avengers.endgame.instrument;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;
    private final InstrumentMapper instrumentMapper;

    public InstrumentService(InstrumentRepository instrumentRepository, InstrumentMapper instrumentMapper) {
        this.instrumentRepository = instrumentRepository;
        this.instrumentMapper = instrumentMapper;
    }

    public InstrumentResponseDto createInstrument(CreateInstrumentRequestDto request) {
        Instrument savedInstrument = instrumentRepository.save(instrumentMapper.toEntity(request));
        return instrumentMapper.toResponse(savedInstrument);
    }

    public InstrumentResponseDto getInstrumentBySymbol(String symbol) {
        Instrument instrument = instrumentRepository.findBySymbol(symbol)
                .orElseGet(() -> createNewInstrument(symbol));
        return instrumentMapper.toResponse(instrument);
    }

    private Instrument createNewInstrument(String symbol) {
        // Create a new instrument for stocks not yet in the database
        Instrument newInstrument = new Instrument();
        newInstrument.setInstrumentId(UUID.randomUUID());
        newInstrument.setSymbol(symbol.toUpperCase());
        newInstrument.setName(symbol.toUpperCase()); // Use symbol as name for now
        newInstrument.setSecurityType(SecurityType.equity);
        newInstrument.setExchange("UNKNOWN"); // Will be determined by Fauxnance API
        newInstrument.setCurrency("USD");
        newInstrument.setIsin(null);
        newInstrument.setActive(true);
        
        // Save and return the new instrument
        return instrumentRepository.save(newInstrument);
    }

    public List<InstrumentResponseDto> getAllInstruments() {
        return instrumentRepository.findAll().stream()
                .map(instrumentMapper::toResponse)
                .collect(Collectors.toList());
    }
}
