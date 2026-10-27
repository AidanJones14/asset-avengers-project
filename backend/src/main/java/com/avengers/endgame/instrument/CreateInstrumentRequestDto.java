package com.avengers.endgame.instrument;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateInstrumentRequestDto(
        @NotBlank(message = "symbol is required")
        String symbol,
        @NotBlank(message = "name is required")
        String name,
        @NotNull(message = "securityType is required")
        SecurityType securityType,
        String exchange,
        String currency,
        String isin,
        Boolean isActive
) {
}

