package com.avengers.endgame.admin;

import com.avengers.endgame.order.domain.OrderSide;
import com.avengers.endgame.order.domain.OrderStatus;
import com.avengers.endgame.order.domain.OrderType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// One order with its current status, from admin.trades.
public record AdminOrderDto(
        UUID orderId,
        UUID clientId,
        UUID accountId,
        String symbol,
        OrderSide orderSide,
        OrderType orderType,
        BigDecimal quantity,
        BigDecimal limitPrice,
        BigDecimal stopPrice,
        OrderStatus status,
        Instant placedAt,
        Instant acceptedAt,
        Instant submittedAt,
        Instant filledAt,
        BigDecimal fillPrice,
        Instant rejectedAt,
        String rejectionReason,
        Instant cancelledAt,
        BigDecimal cashChange,
        BigDecimal holdingChange
) {
}
