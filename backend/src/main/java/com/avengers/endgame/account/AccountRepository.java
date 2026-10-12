package com.avengers.endgame.account;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Account, UUID> {
    List<Account> findByUserUserId(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.accountId = :accountId")
    Optional<Account> findByIdForUpdate(@Param("accountId") UUID accountId);
}
