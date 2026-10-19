package com.avengers.internal.admin;

public interface AdminAuditSink {
    void record(AdminAuditEntry entry);
}
