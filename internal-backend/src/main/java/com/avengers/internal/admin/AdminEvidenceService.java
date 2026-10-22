package com.avengers.internal.admin;

import com.avengers.internal.common.Rows;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;

/** Shared recorded evidence for screen, JSON and PDF; never recreates quotes. */
@Service
@Transactional(isolation = Isolation.REPEATABLE_READ)
public class AdminEvidenceService {
    private final NamedParameterJdbcTemplate jdbc;
    private final AdminLookupService lookup;
    private final ObjectMapper json;
    public AdminEvidenceService(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc,
            AdminLookupService lookup, ObjectMapper json) {
        this.jdbc=jdbc;this.lookup=lookup;this.json=json;
    }
    // The actor comes from the controller's @CurrentActor; the lookup records the view in admin_audit_log.
    public Map<String,Object> timeline(UUID id, AdminActor actor) {
        var lifecycle=lookup.getOrderLifecycle(id,actor);
        var events=jdbc.query("""
            SELECT event_id,event_type,event_at,quantity,price,rejection_reason,terminal,provenance
            FROM trade_lifecycle_events WHERE order_id=:id ORDER BY event_at,event_id
            """,Map.of("id",id),Rows::read);
        return Map.of("order",lifecycle.order(),"events",events);
    }
    public List<Map<String,Object>> pricing(UUID id, AdminActor actor) {
        lookup.getOrderLifecycle(id,actor);
        return jdbc.query("SELECT evidence_id,order_id,phase,decision,reason,observed_at,quote::text AS quote FROM audit.pricing_evidence WHERE order_id=:id ORDER BY observed_at,evidence_id",
            Map.of("id",id),(rs,n) -> {
                var row=Rows.read(rs,n);
                String quote=rs.getString("quote");
                row.put("quote",quote==null?null:json.readTree(quote));
                return row;
            });
    }
    public Map<String,Object> export(UUID id, AdminActor actor) {
        var evidence=new LinkedHashMap<String,Object>(timeline(id, actor));
        evidence.put("pricing",pricing(id, actor));
        evidence.put("cashMovements",jdbc.query(
            "SELECT change_id,change_type,cash_delta,holding_delta,occurred_at FROM cash_holding_changes WHERE order_id=:id ORDER BY occurred_at,change_id",
            Map.of("id",id),Rows::read));
        evidence.put("exportedAt",Instant.now());
        return evidence;
    }
}
