package com.avengers.endgame.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record OrderResponseDto(
        UUID orderId,
        UUID accountId,
        UUID instrumentId,
        OrderType orderType,
        OrderSide orderSide,
        BigDecimal quantity,
        BigDecimal price,
        BigDecimal limitPrice,
        BigDecimal stopPrice,
        OrderStatus status,
        Instant submittedAt,
        Instant updatedAt
) {}