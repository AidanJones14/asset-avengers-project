package com.avengers.endgame.order.service;

import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class QuoteValidationException extends ResponseStatusException {
    private final QuoteResponse quote;
    public QuoteValidationException(String reason, QuoteResponse quote) {
        super(HttpStatus.BAD_GATEWAY,reason);
        this.quote=quote;
    }
    public QuoteResponse quote() { return quote; }
}
