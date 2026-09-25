package com.avengers.endgame.order;

import java.time.Instant;
import java.util.UUID;

public record OrderResponseDto(
        UUID orderId,
        UUID accountId,
        UUID instrumentId,
        OrderType orderType,
        OrderSide orderSide,
        double quantity,
        Double price,
        OrderStatus status,
        Instant submittedAt
) {}