package com.avengers.endgame.watchlist;

import com.avengers.endgame.security.CurrentUserId;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

// Owner: watchlist domain (web layer). The caller's starred symbols, under /api/v1/me/watchlist.
// Before any method here runs:
//   - SecurityConfig allows only CLIENT tokens on /api/v1/me/** (anyone else gets 403)
//   - UserProvisioningInterceptor has made sure the caller's users row exists
// Reading the list happens elsewhere: GET /api/v1/bank-accounts/trading-account returns watchedSymbols.
@RestController
@RequestMapping("/api/v1/me/watchlist")
public class WatchlistController {
    private final WatchlistService service;

    // Constructor injection: Spring passes in the WatchlistService bean.
    public WatchlistController(WatchlistService service) {
        this.service = service;
    }

    // PUT /api/v1/me/watchlist/{symbol}: star a symbol. Returns the caller's updated list.
    // userId comes from the token (@CurrentUserId), so a client can only change their own list.
    @PutMapping("/{symbol}")
    public List<String> add(@CurrentUserId UUID userId, @PathVariable String symbol) {
        return service.change(userId, symbol, true);
    }

    // DELETE /api/v1/me/watchlist/{symbol}: unstar a symbol. Returns the caller's updated list.
    @DeleteMapping("/{symbol}")
    public List<String> remove(@CurrentUserId UUID userId, @PathVariable String symbol) {
        return service.change(userId, symbol, false);
    }
}
