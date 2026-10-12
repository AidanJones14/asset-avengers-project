package com.avengers.endgame.integration.pricing.exception;

public class PricingApiException extends RuntimeException {
    public PricingApiException(String message) {
        super(message);
    }

    public PricingApiException(String message, Throwable cause) {
        super(message, cause);
    }
}

