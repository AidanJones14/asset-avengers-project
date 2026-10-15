package com.avengers.internal.admin;

import java.util.UUID;

// Mirrors the trading command's JSON contract without linking its implementation.
public record InstrumentResponseDto(
        UUID instrumentId,
        String symbol,
        String name,
        SecurityType securityType,
        String exchange,
        String currency,
        String isin,
        boolean isActive
) {
}
