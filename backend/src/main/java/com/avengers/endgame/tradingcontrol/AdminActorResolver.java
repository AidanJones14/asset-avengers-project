package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.user.User;
import com.avengers.endgame.user.UserRepository;
import org.springframework.stereotype.Component;

import java.util.UUID;

// Owner: trading control (admin commands). Builds the AdminActor that staff_audit_events records for a
//   command: who ran it (their id) and their email.
// Used by: TradingAdminCommandController, which passes the admin's id from @CurrentUserId.
// Before it runs: SecurityConfig allowed only ADMIN/SUPER_ADMIN on /api/v1/admin/**, and
//   UserProvisioningInterceptor upserted the admin's users row from the same token. So the email stored
//   there is the token's, and this class reads no token and checks no role itself.
@Component
public class AdminActorResolver {
    private final UserRepository users;

    // Constructor injection: Spring passes in the UserRepository bean.
    public AdminActorResolver(UserRepository users) {
        this.users = users;
    }

    public AdminActor resolve(UUID adminId) {
        // Provisioning always runs first, so a missing row is a bug: fail loudly (500) rather than audit no email.
        String email = users.findById(adminId).map(User::getEmail)
                .orElseThrow(() -> new IllegalStateException("No users row for admin " + adminId));
        return new AdminActor(adminId, email);
    }
}
