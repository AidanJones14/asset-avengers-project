package com.avengers.endgame.user;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.util.UUID;

@Entity
public class User {
    @Id
    private UUID userId;

    private String Name;

    private UserRole Role;

    public User() {}
}