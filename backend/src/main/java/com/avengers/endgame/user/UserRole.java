package com.avengers.endgame.user;

import java.util.List;
import java.util.Optional;

// Owner: user domain. The role stored in the trading DB's users.role column.
// JPA writes the constant's name (@Enumerated(EnumType.STRING) on User.role), so the names stay
//   lower-case to match the column's CHECK (role IN ('admin', 'analyst', 'client')).
// Used by: UserProvisioningInterceptor (maps the token's roles) and UserProvisioningService
//   (only clients get a trading account).
// Not used for access control: Spring Security decides access from the token's own roles
//   (ROLE_CLIENT, ...) in SecurityConfig. This stored copy is for the database, e.g. the triggers
//   that stop staff from owning trading accounts.
public enum UserRole {
    admin,
    analyst,
    client;

    // Maps the token's "roles" claim (e.g. ["CLIENT"]) to the one role we store.
    // Token roles are upper-case (ADMIN, SUPER_ADMIN, ANALYST, CLIENT); users.role is lower-case.
    public static Optional<UserRole> fromTokenRoles(List<String> roles) {
        // 1. No roles claim at all: there's nothing safe to store.
        if (roles == null) {
            return Optional.empty();
        }
        // 2. Checked from most to least privileged, so a user with several roles gets the highest.
        //    SUPER_ADMIN has no column value of its own and is stored as admin.
        if (roles.contains("ADMIN") || roles.contains("SUPER_ADMIN")) {
            return Optional.of(admin);
        }
        if (roles.contains("ANALYST")) {
            return Optional.of(analyst);
        }
        if (roles.contains("CLIENT")) {
            return Optional.of(client);
        }
        // 3. Only unknown roles: empty, so nothing is provisioned. Never default to client here;
        //    that would give a role-less token a users row and a trading account.
        return Optional.empty();
    }
}
