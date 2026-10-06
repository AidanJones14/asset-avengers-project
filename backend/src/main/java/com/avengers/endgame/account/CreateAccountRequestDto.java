package com.avengers.endgame.account;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateAccountRequestDto(
        @NotNull(message = "userId is required")
        UUID userId,
        @NotNull(message = "cashBalance is required")
        @DecimalMin(value = "0", inclusive = true, message = "cashBalance must be >= 0")
        BigDecimal cashBalance
) {
}

