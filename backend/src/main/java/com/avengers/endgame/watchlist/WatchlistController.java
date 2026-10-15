package com.avengers.endgame.watchlist;

import com.avengers.endgame.session.CurrentUserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/me/watchlist")
public class WatchlistController {
    private final CurrentUserService current;
    private final WatchlistService service;
    public WatchlistController(CurrentUserService current, WatchlistService service) {
        this.current = current; this.service = service;
    }
    @PutMapping("/{symbol}")
    public List<String> add(@AuthenticationPrincipal Jwt jwt, @PathVariable String symbol) {
        return service.change(current.userId(jwt), symbol, true);
    }
    @DeleteMapping("/{symbol}")
    public List<String> remove(@AuthenticationPrincipal Jwt jwt, @PathVariable String symbol) {
        return service.change(current.userId(jwt), symbol, false);
    }
}
