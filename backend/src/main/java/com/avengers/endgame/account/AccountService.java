package com.avengers.endgame.account;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

// Owner: account domain (service layer). Reads a client's trading (brokerage) account.
// Used by: AccountController (GET-style lookup of the caller's account).
// Does not create accounts: UserProvisioningService opens a client's one account on their first
//   request. Each client has exactly one account for now (team decision 2026-10-15). Supporting
//   several later means adding an explicit "open account" method here; the schema already allows it.
@Service
public class AccountService {

    private final AccountRepository accountRepository;
    private final AccountMapper accountMapper;

    // Constructor injection: Spring passes in the repository and mapper beans.
    public AccountService(AccountRepository accountRepository, AccountMapper accountMapper) {
        this.accountRepository = accountRepository;
        this.accountMapper = accountMapper;
    }

    // Returns the caller's trading account. userId always comes from the token (@CurrentUserId),
    // never from the request, so a client can only ever see their own account.
    public AccountResponseDto getForUser(UUID userId) {
        // 1. Owner-scoped lookup: only accounts whose user is the caller.
        // 2. Provisioning has already opened it, so a miss means something is wrong: 404.
        Account account = accountRepository.findByUserUserId(userId).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trading account not found"));
        // 3. Map to the response shape, so the JPA entity never leaves the service.
        return accountMapper.toResponse(account);
    }
}
