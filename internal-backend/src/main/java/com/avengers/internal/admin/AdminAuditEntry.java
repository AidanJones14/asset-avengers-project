package com.avengers.internal.admin;

import java.util.UUID;

// A row to append to admin_audit_log. Use the factory methods; they fill in the
// targets each action's check constraint requires.
public record AdminAuditEntry(
        AdminActor actor,
        AdminAction action,
        UUID targetAccountId,
        UUID targetInstrumentId,
        UUID targetOrderId,
        String reason
) {

    public static AdminAuditEntry forAccount(AdminActor actor, AdminAction action, UUID accountId, String reason) {
        return new AdminAuditEntry(actor, action, accountId, null, null, reason);
    }

    public static AdminAuditEntry forInstrument(AdminActor actor, AdminAction action, UUID instrumentId, String reason) {
        return new AdminAuditEntry(actor, action, null, instrumentId, null, reason);
    }

    public static AdminAuditEntry forOrder(AdminActor actor, AdminAction action, UUID orderId, UUID accountId) {
        return new AdminAuditEntry(actor, action, accountId, null, orderId, null);
    }
}
