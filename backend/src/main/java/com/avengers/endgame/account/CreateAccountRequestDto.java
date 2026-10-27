package com.avengers.endgame.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateAccountRequestDto(
        @NotBlank @Size(max = 100) String accountName,
        @NotBlank @Size(max = 80) String accountType
) {
}
