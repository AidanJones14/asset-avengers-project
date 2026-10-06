package com.avengers.endgame.account;

import com.avengers.endgame.holding.Holding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

import java.util.List;
import java.util.UUID;

@NoRepositoryBean
public interface AccountRepository extends JpaRepository<Holding, UUID> {
    List<Holding> findHoldings();
}

