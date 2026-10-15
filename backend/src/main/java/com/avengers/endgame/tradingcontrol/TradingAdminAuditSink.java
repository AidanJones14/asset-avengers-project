package com.avengers.endgame.tradingcontrol;

import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;

@Repository
public class TradingAdminAuditSink implements AdminAuditSink {
    private final JdbcTemplate jdbc;
    public TradingAdminAuditSink(JdbcTemplate jdbc) {this.jdbc=jdbc;}
    public void record(AdminAuditEntry entry) {
        jdbc.update("""
            INSERT INTO staff_audit_events(actor_id,actor_email,action,target_account_id,
                target_instrument_id,target_order_id,reason) VALUES (?,?,?,?,?,?,?)
            """,entry.actor().userId(),entry.actor().email(),entry.action().name(),entry.targetAccountId(),
            entry.targetInstrumentId(),entry.targetOrderId(),entry.reason());
    }
}
