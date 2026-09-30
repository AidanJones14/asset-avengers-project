package com.avengers.endgame.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserAccountRepository extends JpaRepository<Account, UUID> {
    List<Account> findByUserUserId(UUID userId);
}

