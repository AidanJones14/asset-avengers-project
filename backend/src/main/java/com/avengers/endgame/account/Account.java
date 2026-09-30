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

    @Column(name = "cash_balance", nullable = false)
    private BigDecimal cashBalance;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "is_suspended", nullable = false)
    private boolean suspended;

    public Account(User user, BigDecimal cashBalance) {
        this.user = user;
        this.cashBalance = cashBalance;
        this.updatedAt = Instant.now();
        this.suspended = false;
    }
}

