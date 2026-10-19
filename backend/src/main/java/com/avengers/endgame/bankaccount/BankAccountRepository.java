package com.avengers.endgame.bankaccount;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

// Owner: bank-account domain (data access). Spring Data JPA writes the implementation at startup,
//   building each query from the method name.
// Client-facing code looks bank accounts up only through the user-scoped methods below.
@Repository
public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
    // All bank accounts linked by one user.
    List<BankAccount> findByUserUserId(UUID userId);

    // One bank account, only if it belongs to this user ("where id = ? and user.userId = ?").
    // Empty for both "doesn't exist" and "someone else's", so callers can't tell the two apart.
    Optional<BankAccount> findByBankAccountIdAndUserUserId(UUID bankAccountId, UUID userId);
}
