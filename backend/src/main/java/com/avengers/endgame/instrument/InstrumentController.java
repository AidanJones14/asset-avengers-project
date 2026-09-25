package com.avengers.endgame.instrument;

import org.springframework.web.bind.annotation.*;

import java.util.List;

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

    @GetMapping("/symbol/{symbol}")
    public Instrument getInstrumentBySymbol(@PathVariable String symbol) {
        return instrumentService.getInstrumentBySymbol(symbol);
    }

    @GetMapping
    public List<Instrument> getAllInstruments() {
        return instrumentService.getAllInstruments();
    }
}
