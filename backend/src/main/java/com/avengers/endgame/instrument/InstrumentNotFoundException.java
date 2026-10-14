package com.avengers.endgame.instrument;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(value = HttpStatus.NOT_FOUND)
public class InstrumentNotFoundException extends RuntimeException {
    public InstrumentNotFoundException(String message) {
        super(message);
    }
}
