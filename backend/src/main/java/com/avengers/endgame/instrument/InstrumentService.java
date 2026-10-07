package com.avengers.endgame.instrument;

import org.springframework.stereotype.Service;

import java.util.List;
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
        return instrumentRepository.findBySymbol(symbol)
                .map(instrumentMapper::toResponse)
                .orElseThrow(() -> new RuntimeException("Instrument not found"));
    }

    public List<InstrumentResponseDto> getAllInstruments() {
        return instrumentRepository.findAll().stream()
                .map(instrumentMapper::toResponse)
                .collect(Collectors.toList());
    }
}
