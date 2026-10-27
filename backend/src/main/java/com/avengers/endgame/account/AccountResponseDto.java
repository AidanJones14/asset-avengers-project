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
        Instant updatedAt,
        String suspensionReason,
        Instant scheduledSuspensionAt
) {
    public AccountResponseDto(UUID accountId, UUID userId, String accountName, String accountType,
                              BigDecimal cashBalance, boolean suspended, boolean deactivated, Instant updatedAt) {
        this(accountId, userId, accountName, accountType, cashBalance, suspended, deactivated, updatedAt, null, null);
    }
    public AccountResponseDto(UUID accountId, UUID userId, BigDecimal cashBalance,
                              boolean suspended, Instant updatedAt) {
        this(accountId, userId, "Main brokerage", "Individual Brokerage",
                cashBalance, suspended, false, updatedAt);
    }
}
