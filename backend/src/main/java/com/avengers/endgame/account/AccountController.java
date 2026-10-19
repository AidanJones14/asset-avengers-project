package com.avengers.endgame.account;

import com.avengers.endgame.security.CurrentUserId;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

// Owner: account domain (web layer). The caller's trading account, under /api/v1/me/accounts.
// Before any method here runs:
//   - SecurityConfig allows only CLIENT tokens on /api/v1/me/** (anyone else gets 403)
//   - UserProvisioningInterceptor has made sure the caller's users row and account exist
// So this controller holds no security logic: it takes the caller's id and asks the service.
@RestController
@RequestMapping("/api/v1/me/accounts")
public class AccountController {
    private final AccountService accountService;

    // Constructor injection: Spring passes in the AccountService bean.
    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    // POST /api/v1/me/accounts: returns the caller's one trading account.
    // Kept as POST so existing callers keep working. The account was already opened by provisioning,
    //   so nothing is created here, and calling it again returns the same account.
    // Nothing in the request can choose the owner or the cash: the owner is the token's sub,
    //   delivered by @CurrentUserId.
    @PostMapping
    public AccountResponseDto createAccount(@CurrentUserId UUID userId) {
        return accountService.getForUser(userId);
    }
}
