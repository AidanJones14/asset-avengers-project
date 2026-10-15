package com.avengers.endgame.session;

import lombok.RequiredArgsConstructor;
import com.avengers.endgame.account.*;
import com.avengers.endgame.user.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.math.BigDecimal;
import java.util.UUID;

/** Connects the verified auth UUID to persisted client state; never trusts a supplied owner ID. */
@Service
@Transactional
@RequiredArgsConstructor
public class CurrentUserService {
    private final UserRepository users;
    private final AccountRepository accounts;

    public Account account(Jwt jwt) {
        if (jwt == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Log in to access your portfolio");
        if (jwt.getClaimAsStringList("roles") == null || !jwt.getClaimAsStringList("roles").contains("CLIENT"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "A client account is required");
        UUID userId = UUID.fromString(jwt.getSubject());
        // Atomic PostgreSQL upsert; the stable auth UUID links the two databases.
        if (!users.existsById(userId)) users.insertIfAbsent(userId, jwt.getClaimAsString("email"), "client");
        // Hold the user lock through account lookup/create so concurrent first
        // requests cannot each create their own empty account for the same login.
        User user = users.findByIdForUpdate(userId).orElseThrow();
        return accounts.findByUserUserId(userId).stream().findFirst()
                .orElseGet(() -> accounts.save(new Account(user, BigDecimal.ZERO)));
    }
    public UUID userId(Jwt jwt) { return account(jwt).getUser().getUserId(); }
    public void requireAccount(Jwt jwt, UUID accountId) {
        if (accountId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account ID is required");
        if (!account(jwt).getAccountId().equals(accountId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This account does not belong to you");
    }
}
