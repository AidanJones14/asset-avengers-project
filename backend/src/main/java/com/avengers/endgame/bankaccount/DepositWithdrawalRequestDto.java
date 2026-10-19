package com.avengers.endgame.bankaccount;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

// Body of POST /api/v1/bank-accounts/deposit and /withdraw (checked by @Valid in BankAccountController).
// bankAccountId is a UUID, so Spring rejects a malformed id while reading the body (400) before
//   the service runs. The frontend already sends it as a UUID string.
// Both fields are required: a missing amount would otherwise fail later as a 500.
public record DepositWithdrawalRequestDto(
    @NotNull UUID bankAccountId,
    @NotNull @DecimalMin("0.01") BigDecimal amount
) {}
