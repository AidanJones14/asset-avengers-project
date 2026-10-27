package com.avengers.endgame.instrument;

import java.util.UUID;

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

