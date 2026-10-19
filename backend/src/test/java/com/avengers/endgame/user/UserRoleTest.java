package com.avengers.endgame.user;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;

// Unit test for UserRole.fromTokenRoles: how the token's "roles" claim (upper-case, set by
//   auth-server) becomes the one lower-case role stored in users.role.
// Plain JUnit: no Spring context, no database.
// What it pins down:
//   - the highest role wins when a token has several
//   - a token with no known role maps to nothing, so UserProvisioningInterceptor provisions
//     nothing for it (never a default client)
class UserRoleTest {

    @Test
    void eachKnownTokenRoleMapsToItsStoredRole() {
        assertEquals(Optional.of(UserRole.client), UserRole.fromTokenRoles(List.of("CLIENT")));
        assertEquals(Optional.of(UserRole.analyst), UserRole.fromTokenRoles(List.of("ANALYST")));
        assertEquals(Optional.of(UserRole.admin), UserRole.fromTokenRoles(List.of("ADMIN")));
        // SUPER_ADMIN has no column value of its own and is stored as admin.
        assertEquals(Optional.of(UserRole.admin), UserRole.fromTokenRoles(List.of("SUPER_ADMIN")));
    }

    @Test
    void theHighestRoleWinsWhenATokenHasSeveral() {
        assertEquals(Optional.of(UserRole.admin), UserRole.fromTokenRoles(List.of("CLIENT", "ADMIN")));
        assertEquals(Optional.of(UserRole.analyst), UserRole.fromTokenRoles(List.of("CLIENT", "ANALYST")));
    }

    @Test
    void noKnownRoleMapsToNothing() {
        // 1. No roles claim, or an empty one.
        assertEquals(Optional.empty(), UserRole.fromTokenRoles(null));
        assertEquals(Optional.empty(), UserRole.fromTokenRoles(List.of()));
        // 2. Only roles we don't know.
        assertEquals(Optional.empty(), UserRole.fromTokenRoles(List.of("SOMETHING_ELSE")));
        // 3. Names are case-sensitive, like hasRole("CLIENT") in SecurityConfig. A token that the URL
        //    rules wouldn't treat as a client must not get a client's trading account either.
        assertEquals(Optional.empty(), UserRole.fromTokenRoles(List.of("client")));
    }
}
