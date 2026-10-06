package com.avengers.endgame.order;

import java.math.BigDecimal;
import java.util.UUID;

public record OrderRequestDto(
        UUID accountId,
        UUID instrumentId,
        OrderType orderType,
        OrderSide orderSide,
        BigDecimal quantity,
        BigDecimal limitPrice,
        BigDecimal stopPrice
) {}
