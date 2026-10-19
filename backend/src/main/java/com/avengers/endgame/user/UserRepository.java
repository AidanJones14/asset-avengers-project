package com.avengers.endgame.user;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

// Owner: user domain (data access). Spring Data JPA writes the implementation of this interface
//   at startup; JpaRepository adds findById, save, existsById and the rest.
// Rows are keyed by the token's sub (the auth-server user id). Spring never generates user ids.
// The only code that creates or changes rows is UserProvisioningService (upsertFromToken).
// Used by:
//   - UserProvisioningService: upsertFromToken, findByIdForUpdate
//   - WatchlistService.change: findByIdForUpdate (creates the caller's watchlist once)
//   - BankAccountService.createBankAccount: findById (the owner of a new bank account)
public interface UserRepository extends JpaRepository<User, UUID> {

    // SELECT ... FOR UPDATE on one users row. The row stays locked until the caller's transaction
    // ends, so concurrent first requests for the same user take turns
    // (UserProvisioningService, steps 3–4). Call it only from a @Transactional method: the lock
    // lasts as long as the transaction, and Spring Data gives declared queries none of their own.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.userId = :userId")
    Optional<User> findByIdForUpdate(@Param("userId") UUID userId);

    // Keeps the caller's users row in step with their token, in one atomic statement:
    //   - no row yet          -> INSERT (their first request)
    //   - row differs         -> UPDATE email/role (e.g. the role was changed in auth-server)
    //   - row already matches -> no write (the WHERE skips the update; the usual case)
    // Native SQL because JPQL has no ON CONFLICT. Named parameters (:userId) are bound by the
    //   driver, never pasted into the SQL, so there's no injection risk.
    // Postgres only: H2 (the default test database) rejects ON CONFLICT ... DO UPDATE, so tests on
    //   H2 mock this (UserProvisioningServiceTest) and the real statement is tested against Postgres.
    // @Modifying marks this as a write. It must run inside a transaction
    //   (UserProvisioningService.provision is @Transactional).
    // Returns the number of rows inserted or updated: 1, or 0 when nothing changed.
    @Modifying
    @Query(value = """
        INSERT INTO users (user_id, email, role)
        VALUES (:userId, :email, :role)
        ON CONFLICT (user_id) DO UPDATE
            SET email = EXCLUDED.email, role = EXCLUDED.role
            WHERE users.email IS DISTINCT FROM EXCLUDED.email
               OR users.role IS DISTINCT FROM EXCLUDED.role
        """, nativeQuery = true)
    int upsertFromToken(@Param("userId") UUID userId, @Param("email") String email, @Param("role") String role);
}
