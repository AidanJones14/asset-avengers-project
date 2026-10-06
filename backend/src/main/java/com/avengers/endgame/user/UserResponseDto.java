package com.avengers.endgame.user;

import java.util.UUID;

public record UserResponseDto(
        UUID userId,
        String name,
        UserRole role
) {
}

