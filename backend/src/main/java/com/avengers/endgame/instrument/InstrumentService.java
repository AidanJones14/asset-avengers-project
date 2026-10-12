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

    public Instrument getInstrumentBySymbol(String symbol) {
        return instrumentRepository.findBySymbol(symbol)
                .orElseGet(() -> createNewInstrument(symbol));
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

    public List<Instrument> getAllInstruments() {
        return instrumentRepository.findAll();
    }
}
