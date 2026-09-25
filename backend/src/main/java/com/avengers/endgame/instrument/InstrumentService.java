package com.avengers.endgame.instrument;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class InstrumentService {

    private final InstrumentRepository instrumentRepository;

    public InstrumentService(InstrumentRepository instrumentRepository) {
        this.instrumentRepository = instrumentRepository;
    }

    public Instrument saveInstrument(Instrument instrument) {
        return instrumentRepository.save(instrument);
    }

    public Instrument getInstrumentById(UUID id) {
        return instrumentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Instrument not found"));
    }

    public List<Instrument> getAllInstruments() {
        return instrumentRepository.findAll();
    }
}
