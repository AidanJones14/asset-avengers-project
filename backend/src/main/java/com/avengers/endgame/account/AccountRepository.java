package com.avengers.endgame.account;

import com.avengers.endgame.holding.Holding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Holding, UUID> {
    List<Holding> findHoldings();
}

