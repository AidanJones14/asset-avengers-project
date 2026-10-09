package com.avengers.endgame.instrument;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;

    public InstrumentService(InstrumentRepository instrumentRepository) {
        this.instrumentRepository = instrumentRepository;
    }

    public Instrument saveInstrument(Instrument instrument) {
        return instrumentRepository.save(instrument);
    }

    public Instrument getInstrumentBySymbol(String symbol) {
        return instrumentRepository.findBySymbol(symbol)
                .orElseThrow(() -> new RuntimeException("Instrument not found"));
    }

    public List<Instrument> getAllInstruments() {
        return instrumentRepository.findAll();
    }
}
