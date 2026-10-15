package com.avengers.endgame.admin;

import java.time.Instant;
import java.util.UUID;

// One row of admin.audit_log.
public record AdminAuditLogEntryDto(
        UUID auditId,
        Instant occurredAt,
        UUID actorId,
        String actorEmail,
        AdminAction action,
        String reason,
        UUID targetAccountId,
        String targetClientEmail,
        String targetSymbol,
        UUID targetOrderId
) {
}
