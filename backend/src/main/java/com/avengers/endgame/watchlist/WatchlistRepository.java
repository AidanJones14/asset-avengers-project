package com.avengers.endgame.watchlist;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface WatchlistRepository extends JpaRepository<Watchlist, UUID> {
    Optional<Watchlist> findByUserUserId(UUID userId);
}

