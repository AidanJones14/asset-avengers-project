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
    private final com.avengers.endgame.session.CurrentUserService current;

    public BankAccountController(BankAccountService bankAccountService, com.avengers.endgame.session.CurrentUserService current) {
        this.bankAccountService = bankAccountService;
        this.current = current;
    }

    @PostMapping
    public ResponseEntity<BankAccountResponseDto> createBankAccount(
        @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt,
        @Valid @RequestBody CreateBankAccountRequestDto request
    ) {
        BankAccountResponseDto response = bankAccountService.createBankAccount(current.userId(jwt), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<BankAccountResponseDto>> getUserBankAccounts(
        @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt
    ) {
        List<BankAccountResponseDto> accounts = bankAccountService.getUserBankAccounts(current.userId(jwt));
        return ResponseEntity.ok(accounts);
    }

    @DeleteMapping("/{bankAccountId}")
    public ResponseEntity<Void> deleteBankAccount(
        @PathVariable UUID bankAccountId,
        @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt
    ) {
        bankAccountService.deleteBankAccount(bankAccountId, current.userId(jwt));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/trading-account")
    public TradingAccountSnapshot getTradingAccount(@org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt) {
        return bankAccountService.getTradingAccount(current.userId(jwt));
    }

    @PostMapping("/deposit")
    public ResponseEntity<Void> deposit(
        @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt,
        @Valid @RequestBody DepositWithdrawalRequestDto request
    ) {
        bankAccountService.deposit(current.userId(jwt), request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/withdraw")
    public ResponseEntity<Void> withdraw(
        @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt jwt,
        @Valid @RequestBody DepositWithdrawalRequestDto request
    ) {
        bankAccountService.withdraw(current.userId(jwt), request);
        return ResponseEntity.ok().build();
    }
}
