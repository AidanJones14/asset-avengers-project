package com.avengers.endgame.watchlist;

import com.avengers.endgame.user.UserRepository;
import com.avengers.endgame.instrument.InstrumentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.List;
import java.util.UUID;

@Service
public class WatchlistService {
    private final WatchlistRepository lists;
    private final WatchlistItemRepository items;
    private final UserRepository users;
    private final InstrumentRepository instruments;
    public WatchlistService(WatchlistRepository lists, WatchlistItemRepository items,
            UserRepository users, InstrumentRepository instruments) {
        this.lists = lists; this.items = items; this.users = users; this.instruments = instruments;
    }
    @Transactional(readOnly = true)
    public List<String> symbols(UUID userId) {
        return lists.findByUserUserId(userId).map(list -> items.findByWatchlistWatchlistId(list.getWatchlistId())
            .stream().map(item -> item.getInstrument().getSymbol()).sorted().toList()).orElse(List.of());
    }
    @Transactional
    public List<String> change(UUID userId, String symbol, boolean add) {
        var user = users.findByIdForUpdate(userId).orElseThrow();
        var instrument = instruments.findBySymbol(symbol.trim().toUpperCase()).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock not found"));
        var list = lists.findByUserUserId(userId).orElseGet(() -> lists.save(new Watchlist(user)));
        var existing = items.findByWatchlistWatchlistId(list.getWatchlistId()).stream()
            .filter(item -> item.getInstrument().getInstrumentId().equals(instrument.getInstrumentId())).findFirst();
        if (add && existing.isEmpty()) items.save(new WatchlistItem(list, instrument));
        if (!add) existing.ifPresent(items::delete);
        items.flush();
        return symbols(userId);
    }
}
