package com.avengers.endgame.tradingcontrol;

public interface AdminAuditSink {
    void record(AdminAuditEntry entry);
}
