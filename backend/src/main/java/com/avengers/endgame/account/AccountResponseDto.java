package com.avengers.endgame.account;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record AccountResponseDto(
        UUID accountId,
        UUID userId,
        String accountName,
        String accountType,
        BigDecimal cashBalance,
        boolean suspended,
        boolean deactivated,
        Instant updatedAt
) {
    public AccountResponseDto(UUID accountId, UUID userId, BigDecimal cashBalance,
                              boolean suspended, Instant updatedAt) {
        this(accountId, userId, "Main brokerage", "Individual Brokerage",
                cashBalance, suspended, false, updatedAt);
    }
}
