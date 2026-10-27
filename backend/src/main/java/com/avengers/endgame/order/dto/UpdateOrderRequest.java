package com.avengers.endgame.order.dto;

import java.math.BigDecimal;

/**
 * Either the legacy {@code price} (the limit, or the trigger for stop orders) or explicit
 * {@code limitPrice}/{@code stopPrice}. Omitted explicit prices keep their current values.
 */
public record UpdateOrderRequest(BigDecimal price, BigDecimal limitPrice, BigDecimal stopPrice) {
    public UpdateOrderRequest(BigDecimal price) {
        this(price, null, null);
    }

    public boolean hasExplicitPrices() {
        return limitPrice != null || stopPrice != null;
    }
}
