package com.avengers.endgame.holding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface HoldingRepository extends JpaRepository<Holding, UUID> {
    List<Holding> findByAccountId(UUID accountId);

    Optional<Holding> findByAccountIdAndInstrumentId(UUID accountId, UUID instrumentId);
}

