package com.avengers.endgame.bankaccount;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/bank-accounts")
public class BankAccountController {
    private final BankAccountService bankAccountService;

    public BankAccountController(BankAccountService bankAccountService) {
        this.bankAccountService = bankAccountService;
    }

    @PostMapping
    public ResponseEntity<BankAccountResponseDto> createBankAccount(
        @RequestParam UUID userId,
        @Valid @RequestBody CreateBankAccountRequestDto request
    ) {
        BankAccountResponseDto response = bankAccountService.createBankAccount(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<BankAccountResponseDto>> getUserBankAccounts(
        @RequestParam UUID userId
    ) {
        List<BankAccountResponseDto> accounts = bankAccountService.getUserBankAccounts(userId);
        return ResponseEntity.ok(accounts);
    }

    @DeleteMapping("/{bankAccountId}")
    public ResponseEntity<Void> deleteBankAccount(
        @PathVariable UUID bankAccountId,
        @RequestParam UUID userId
    ) {
        bankAccountService.deleteBankAccount(bankAccountId, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/deposit")
    public ResponseEntity<Void> deposit(
        @RequestParam UUID userId,
        @Valid @RequestBody DepositWithdrawalRequestDto request
    ) {
        bankAccountService.deposit(userId, request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/withdraw")
    public ResponseEntity<Void> withdraw(
        @RequestParam UUID userId,
        @Valid @RequestBody DepositWithdrawalRequestDto request
    ) {
        bankAccountService.withdraw(userId, request);
        return ResponseEntity.ok().build();
    }
}
