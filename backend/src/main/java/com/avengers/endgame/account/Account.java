package com.avengers.endgame.account;

import com.avengers.endgame.user.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "accounts")
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "account_id")
    private UUID accountId;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "account_name", nullable = false, length = 100)
    private String accountName;

    @Column(name = "account_type", nullable = false, length = 80)
    private String accountType;

    @Column(name = "cash_balance", nullable = false, precision = 18, scale = 2)
    private BigDecimal cashBalance;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "is_suspended", nullable = false)
    private boolean suspended;

    @Column(name = "deactivated", nullable = false)
    private boolean deactivated;

    public Account(User user, BigDecimal cashBalance) {
        this(user, "Main brokerage", "Individual Brokerage", cashBalance);
    }

    public Account(User user, String accountName, String accountType, BigDecimal cashBalance) {
        this.user = user;
        this.accountName = accountName;
        this.accountType = accountType;
        this.cashBalance = cashBalance;
        this.updatedAt = Instant.now();
        this.suspended = false;
        this.deactivated = false;
    }
}
