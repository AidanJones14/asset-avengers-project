package com.avengers.endgame.bankaccount;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

public record DepositWithdrawalRequestDto(
    @NotBlank String bankAccountId,
    @DecimalMin("0.01") BigDecimal amount
) {}
