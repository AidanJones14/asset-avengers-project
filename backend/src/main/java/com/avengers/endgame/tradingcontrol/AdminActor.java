package com.avengers.endgame.tradingcontrol;

import java.util.UUID;

// The admin making a request, as recorded in admin_audit_log.
public record AdminActor(UUID userId, String email) {
}
