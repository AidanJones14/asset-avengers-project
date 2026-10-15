package com.avengers.endgame.admin;

import java.time.Instant;
import java.util.UUID;

// Every field is optional. from is inclusive, to is exclusive.
public record AuditLogFilter(
        UUID actorId,
        UUID accountId,
        AdminAction action,
        Instant from,
        Instant to
) {
}
