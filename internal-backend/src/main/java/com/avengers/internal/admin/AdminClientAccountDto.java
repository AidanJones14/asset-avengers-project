package com.avengers.internal.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// One client account, from admin.client_accounts. asOf is when the trading
// database last changed it, so a suspension can take a moment to show here.
public record AdminClientAccountDto(
        UUID clientId,
        UUID accountId,
        String email,
        BigDecimal cashBalance,
        boolean suspended,
        long openPositions,
        Instant asOf
) {
}
