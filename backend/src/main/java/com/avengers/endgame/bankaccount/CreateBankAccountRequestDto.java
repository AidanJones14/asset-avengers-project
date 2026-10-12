package com.avengers.endgame.bankaccount;

import jakarta.validation.constraints.NotBlank;

public record CreateBankAccountRequestDto(
    @NotBlank String bankName,
    @NotBlank String routingNumber,
    @NotBlank String accountNumber,
    @NotBlank String confirmAccountNumber
) {}
