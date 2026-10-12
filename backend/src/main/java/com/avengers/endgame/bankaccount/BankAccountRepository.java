package com.avengers.endgame.bankaccount;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface BankAccountRepository extends JpaRepository<BankAccount, UUID> {
    List<BankAccount> findByUserUserId(UUID userId);
}
