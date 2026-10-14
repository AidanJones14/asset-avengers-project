package com.avengers.endgame.account;

import com.avengers.endgame.session.CurrentUserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/accounts")
public class AccountController {
    private final CurrentUserService current;
    private final AccountMapper mapper;
    public AccountController(CurrentUserService current, AccountMapper mapper) {
        this.current = current; this.mapper = mapper;
    }
    // Creating/restoring an account cannot assign someone else's user ID or invent cash.
    @PostMapping
    public AccountResponseDto createAccount(@AuthenticationPrincipal Jwt jwt) {
        return mapper.toResponse(current.account(jwt));
    }
}
