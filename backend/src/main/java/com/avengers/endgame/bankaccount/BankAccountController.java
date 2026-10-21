package com.avengers.endgame.bankaccount;

import com.avengers.endgame.security.CurrentUserId;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;

// Owner: bank-account domain (web layer). The caller's linked bank accounts, cash moves between
//   them and the trading account, and the trading-account snapshot the frontend's overview loads.
// Before any method here runs:
//   - SecurityConfig allows only CLIENT tokens on /api/v1/bank-accounts/** (anyone else gets 403)
//   - UserProvisioningInterceptor has made sure the caller's users row and trading account exist
// Every method passes the caller's id (@CurrentUserId, from the token) to the service. Request
//   bodies never carry a user id. Where a body names a bank account (deposit/withdraw), the service
//   checks that it belongs to the caller.
@RestController
@RequestMapping("/api/v1/bank-accounts")
public class BankAccountController {
    private final BankAccountService bankAccountService;

    // Constructor injection: Spring passes in the BankAccountService bean.
    public BankAccountController(BankAccountService bankAccountService) {
        this.bankAccountService = bankAccountService;
    }

    // POST /api/v1/bank-accounts: link a bank account to the caller. 201 with the new account.
    @PostMapping
    public ResponseEntity<BankAccountResponseDto> createBankAccount(
        @CurrentUserId UUID userId,
        @Valid @RequestBody CreateBankAccountRequestDto request
    ) {
        BankAccountResponseDto response = bankAccountService.createBankAccount(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // GET /api/v1/bank-accounts: the caller's linked bank accounts only.
    @GetMapping
    public ResponseEntity<List<BankAccountResponseDto>> getUserBankAccounts(
        @CurrentUserId UUID userId
    ) {
        List<BankAccountResponseDto> accounts = bankAccountService.getUserBankAccounts(userId);
        return ResponseEntity.ok(accounts);
    }

    // DELETE /api/v1/bank-accounts/{bankAccountId}: unlink one. The service checks it's the caller's.
    @DeleteMapping("/{bankAccountId}")
    public ResponseEntity<Void> deleteBankAccount(
        @PathVariable UUID bankAccountId,
        @CurrentUserId UUID userId
    ) {
        bankAccountService.deleteBankAccount(bankAccountId, userId);
        return ResponseEntity.noContent().build();
    }

    // GET /api/v1/bank-accounts/trading-account: the caller's cash, holdings, orders and watchlist
    // in one snapshot. accountId is optional for backwards compatibility; when present, the
    // service verifies that it is an active account owned by the caller.
    @GetMapping("/trading-account")
    public TradingAccountSnapshot getTradingAccount(
        @CurrentUserId UUID userId,
        @RequestParam(required = false) UUID accountId
    ) {
        return bankAccountService.getTradingAccount(userId, accountId);
    }

    // POST /api/v1/bank-accounts/deposit: move cash from one of the caller's bank accounts into
    // the selected investment account. The service checks both ids belong to the caller.
    @PostMapping("/deposit")
    public ResponseEntity<Void> deposit(
        @CurrentUserId UUID userId,
        @Valid @RequestBody DepositWithdrawalRequestDto request
    ) {
        bankAccountService.deposit(userId, request);
        return ResponseEntity.ok().build();
    }

    // POST /api/v1/bank-accounts/withdraw: move cash from the caller's trading account to one of
    // their bank accounts. Same ownership check as deposit.
    @PostMapping("/withdraw")
    public ResponseEntity<Void> withdraw(
        @CurrentUserId UUID userId,
        @Valid @RequestBody DepositWithdrawalRequestDto request
    ) {
        bankAccountService.withdraw(userId, request);
        return ResponseEntity.ok().build();
    }
}
