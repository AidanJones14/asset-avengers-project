package com.avengers.endgame.admin;

import java.math.BigDecimal;
import java.time.Instant;

// One step of an order's life, from admin.trade_timeline. step is a status
// (accepted, submitted, filled, rejected, cancelled) or cash_and_holding_change.
public record AdminOrderEventDto(
        String step,
        Instant occurredAt,
        BigDecimal quantity,
        BigDecimal price,
        String rejectionReason,
        BigDecimal cashDelta,
        BigDecimal cashBalanceAfter,
        BigDecimal holdingDelta,
        BigDecimal holdingQuantityAfter
) {
}
