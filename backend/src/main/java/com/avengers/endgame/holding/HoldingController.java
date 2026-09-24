package com.avengers.endgame.holding;

import com.avengers.endgame.account.AccountRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/accounts/{accountId}/holdings")
public class HoldingController {
    private final AccountRepository accountRepo;

    public HoldingController(AccountRepository accountRepo) {
        this.accountRepo = accountRepo;
    }

    @GetMapping
    public ResponseEntity<HoldingResponseDto> getAllHoldings(@PathVariable String accountId,
                                                         @AuthenticationPrincipal Jwt jwt){
        List<Holding> holdings = accountRepo.findAll();
        return ResponseEntity.ok(new HoldingResponseDto(holdings));
    }
}
