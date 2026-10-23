package com.avengers.endgame.bankaccount;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

// Body of POST /api/v1/bank-accounts/deposit and /withdraw (checked by @Valid in BankAccountController).
// bankAccountId is a UUID, so Spring rejects a malformed id while reading the body (400) before
//   the service runs. The frontend already sends it as a UUID string.
// Both fields are required: a missing amount would otherwise fail later as a 500.
// amount: at least 0.01, at most 2 decimal places and 16 whole digits (what the cash columns hold).
// accountId identifies the selected investment account and is required by both service operations.
public record DepositWithdrawalRequestDto(
    @NotNull UUID bankAccountId,
    @NotNull @DecimalMin("0.01") @Digits(integer = 16, fraction = 2) BigDecimal amount,
    UUID accountId
) {
    public DepositWithdrawalRequestDto(UUID bankAccountId, BigDecimal amount) {
        this(bankAccountId, amount, null);
    }
}
