package com.avengers.endgame.admin;

import java.math.BigDecimal;
import java.time.Instant;

public record AdminPositionDto(
        String symbol,
        String instrumentName,
        BigDecimal quantity,
        Boolean tradable,
        Instant asOf
) {
}
