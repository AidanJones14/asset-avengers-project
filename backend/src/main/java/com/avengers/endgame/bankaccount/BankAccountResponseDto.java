package com.avengers.endgame.bankaccount;

import java.time.Instant;
import java.util.UUID;

public record BankAccountResponseDto(
    UUID bankAccountId,
    String bankName,
    String routingNumber,
    String maskedAccountNumber,  // e.g., "****5678" for security
    Instant createdAt
) {}
