package com.avengers.internal.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SuspensionRequestDto(
        @NotBlank(message = "reason is required")
        @Size(max = 1000, message = "reason must be at most 1000 characters")
        String reason
) {
}
