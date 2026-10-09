package com.avengers.endgame.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record CreateUserRequestDto(
        @NotNull(message = "userId is required")
        UUID userId,
        @NotBlank(message = "name is required")
        String name,
        @NotNull(message = "role is required")
        UserRole role
) {
}

