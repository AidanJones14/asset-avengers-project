package com.avengers.endgame.bankaccount;

import com.avengers.endgame.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "bank_accounts")
public class BankAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "bank_account_id")
    private UUID bankAccountId;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "bank_name", nullable = false, length = 255)
    private String bankName;

    @Column(name = "routing_number", nullable = false, length = 20)
    private String routingNumber;

    @Column(name = "account_number", nullable = false, length = 255)
    private String accountNumber; // Should be encrypted in production

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public BankAccount() {}

    public BankAccount(User user, String bankName, String routingNumber, String accountNumber) {
        this.user = user;
        this.bankName = bankName;
        this.routingNumber = routingNumber;
        this.accountNumber = accountNumber;
        this.createdAt = Instant.now();
    }

    // Getters and setters
    public UUID getBankAccountId() {
        return bankAccountId;
    }

    public void setBankAccountId(UUID bankAccountId) {
        this.bankAccountId = bankAccountId;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getBankName() {
        return bankName;
    }

    public void setBankName(String bankName) {
        this.bankName = bankName;
    }

    public String getRoutingNumber() {
        return routingNumber;
    }

    public void setRoutingNumber(String routingNumber) {
        this.routingNumber = routingNumber;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public void setAccountNumber(String accountNumber) {
        this.accountNumber = accountNumber;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
