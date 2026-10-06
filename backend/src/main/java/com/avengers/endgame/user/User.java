package com.avengers.endgame.user;

import com.avengers.endgame.account.Account;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@Table(name = "users")
public class User {

    // The auth service's user id (the JWT's sub). Never generated here.
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(unique = true)
    private String email;

    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserRole role;

    // Set by the database default.
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "user")
    private List<Account> accounts = new ArrayList<>();

    public User(UUID userId, String name, UserRole role) {
        this.userId = userId;
        this.name = name;
        this.role = role;
    }
}
