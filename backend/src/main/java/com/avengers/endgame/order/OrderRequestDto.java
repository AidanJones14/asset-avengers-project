package com.avengers.endgame.order;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderRequestDto(
        UUID accountId,
        UUID instrumentId,
        String symbol,
        OrderType orderType,
        OrderSide orderSide,
        BigDecimal quantity,
        BigDecimal limitPrice,
        BigDecimal stopPrice
) {
    public OrderRequestDto(
            UUID accountId,
            UUID instrumentId,
            OrderType orderType,
            OrderSide orderSide,
            BigDecimal quantity,
            BigDecimal limitPrice,
            BigDecimal stopPrice
    ) {
        this(accountId, instrumentId, null, orderType, orderSide, quantity, limitPrice, stopPrice);
    }
}
