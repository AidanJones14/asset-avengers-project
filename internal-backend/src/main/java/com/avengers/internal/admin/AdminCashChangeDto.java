package com.avengers.internal.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AdminCashChangeDto(
        Instant occurredAt,
        String changeType,
        String symbol,
        UUID orderId,
        BigDecimal cashDelta,
        BigDecimal cashBalanceAfter,
        BigDecimal holdingDelta,
        BigDecimal holdingQuantityAfter
) {
}
