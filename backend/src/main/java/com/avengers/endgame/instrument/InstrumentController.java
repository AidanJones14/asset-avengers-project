package com.avengers.endgame.instrument;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<InstrumentResponseDto> createInstrument(@Valid @RequestBody CreateInstrumentRequestDto request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(instrumentService.createInstrument(request));
    }

    @GetMapping("/symbol/{symbol}")
    public ResponseEntity<InstrumentResponseDto> getInstrumentBySymbol(@PathVariable String symbol) {
        return ResponseEntity.ok(instrumentService.getInstrumentBySymbol(symbol));
    }

    @GetMapping
    public ResponseEntity<List<InstrumentResponseDto>> getAllInstruments() {
        return ResponseEntity.ok(instrumentService.getAllInstruments());
    }
}
