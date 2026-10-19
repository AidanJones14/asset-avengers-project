package com.avengers.endgame.account;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

// Owner: account domain (data access). Spring Data JPA writes the implementation at startup,
//   building each query from the method name (e.g. findByUserUserId = "where account.user.userId = ?").
public interface AccountRepository extends JpaRepository<Account, UUID> {
    // All trading accounts of one user (in practice one per client).
    List<Account> findByUserUserId(UUID userId);

    // SELECT ... FOR UPDATE on one account, used by order and cash changes so two of them
    // can't change the same balance at once.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.accountId = :accountId")
    Optional<Account> findByIdForUpdate(@Param("accountId") UUID accountId);

    // Does this user already have a trading account? An existence check that doesn't load the account.
    // Used by UserProvisioningService before and after it takes the user-row lock.
    boolean existsByUserUserId(UUID userId);

    // Ownership check: is this account the user's? ("where accountId = ? and user.userId = ?").
    // False for both "doesn't exist" and "someone else's". Used by OrderService before it reads or
    // changes anything tied to an account, and to check an order's account belongs to the caller.
    boolean existsByAccountIdAndUserUserId(UUID accountId, UUID userId);
}
