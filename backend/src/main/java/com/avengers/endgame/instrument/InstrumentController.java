package com.avengers.endgame.instrument;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/instruments")
public class InstrumentController {

    private final InstrumentService instrumentService;

    public InstrumentController(InstrumentService instrumentService) {
        this.instrumentService = instrumentService;
    }

    @PostMapping
    public Instrument createInstrument(@RequestBody Instrument instrument) {
        return instrumentService.saveInstrument(instrument);
    }

    @GetMapping("/{id}")
    public Instrument getInstrumentById(@PathVariable UUID id) {
        return instrumentService.getInstrumentById(id);
    }

    @GetMapping
    public List<Instrument> getAllInstruments() {
        return instrumentService.getAllInstruments();
    }
}
