package com.avengers.endgame.integration.pricing.exception;

import java.time.Instant;

public class PricingRateLimitException extends PricingApiException {
    private final Instant retryAt;
    public PricingRateLimitException(Throwable cause) { this(cause, Instant.now().plusSeconds(60)); }
    public PricingRateLimitException(Throwable cause, Instant retryAt) {
        super("The market pricing provider's request limit has been reached. No saved price is available for this stock. Please try again after the limit resets.", cause);
        this.retryAt = retryAt;
    }
    public Instant retryAt() { return retryAt; }
}
