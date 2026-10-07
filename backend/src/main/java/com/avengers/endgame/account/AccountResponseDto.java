package com.avengers.endgame.account;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AccountResponseDto(
        UUID accountId,
        UUID userId,
        BigDecimal cashBalance,
        boolean suspended,
        Instant updatedAt
) {
}

