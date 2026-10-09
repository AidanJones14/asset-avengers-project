package com.avengers.endgame.order.dto;

import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;

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