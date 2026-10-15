package com.avengers.internal.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// HTTP response contract owned by this service; never a client-backend JPA entity.
public record AccountResponseDto(
        UUID accountId,
        UUID userId,
        BigDecimal cashBalance,
        boolean suspended,
        Instant updatedAt
) {
}
