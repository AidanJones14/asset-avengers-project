package com.avengers.endgame.admin;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static com.avengers.endgame.admin.AdminSql.instant;
import static com.avengers.endgame.admin.AdminSql.uuid;
import static com.avengers.endgame.config.AdminAnalyticsDataSourceConfig.ADMIN_ANALYTICS;

// admin_audit_log is append-only (a trigger rejects updates and deletes), so this
// only inserts and reads.
@Repository
public class AdminAuditRepository {

    private static final RowMapper<AdminAuditLogEntryDto> ENTRY = (rs, row) -> new AdminAuditLogEntryDto(
            uuid(rs, "audit_id"),
            instant(rs, "occurred_at"),
            uuid(rs, "actor_id"),
            rs.getString("actor_email"),
            AdminAction.valueOf(rs.getString("action")),
            rs.getString("reason"),
            uuid(rs, "target_account_id"),
            rs.getString("target_client_email"),
            rs.getString("target_symbol"),
            uuid(rs, "target_order_id"));

    private final NamedParameterJdbcTemplate jdbc;

    public AdminAuditRepository(@Qualifier(ADMIN_ANALYTICS) NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(AdminAuditEntry entry) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("actorId", entry.actor().userId(), Types.OTHER)
                .addValue("actorEmail", entry.actor().email(), Types.VARCHAR)
                .addValue("action", entry.action().name())
                .addValue("accountId", entry.targetAccountId(), Types.OTHER)
                .addValue("instrumentId", entry.targetInstrumentId(), Types.OTHER)
                .addValue("orderId", entry.targetOrderId(), Types.OTHER)
                .addValue("reason", entry.reason(), Types.VARCHAR);
        jdbc.update("""
                INSERT INTO admin_audit_log (actor_id, actor_email, action, target_account_id,
                                             target_instrument_id, target_order_id, reason)
                VALUES (:actorId, :actorEmail, :action, :accountId, :instrumentId, :orderId, :reason)
                """, params);
    }

    public AdminPage<AdminAuditLogEntryDto> search(AuditLogFilter filter, AdminPageRequest page) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        List<String> conditions = new ArrayList<>();
        if (filter.actorId() != null) {
            conditions.add("actor_id = :actorId");
            params.addValue("actorId", filter.actorId(), Types.OTHER);
        }
        if (filter.accountId() != null) {
            conditions.add("target_account_id = :accountId");
            params.addValue("accountId", filter.accountId(), Types.OTHER);
        }
        if (filter.action() != null) {
            conditions.add("action = :action");
            params.addValue("action", filter.action().name());
        }
        if (filter.from() != null) {
            conditions.add("occurred_at >= :from");
            params.addValue("from", OffsetDateTime.ofInstant(filter.from(), ZoneOffset.UTC));
        }
        if (filter.to() != null) {
            conditions.add("occurred_at < :to");
            params.addValue("to", OffsetDateTime.ofInstant(filter.to(), ZoneOffset.UTC));
        }
        return AdminSql.page(jdbc, "FROM admin.audit_log" + AdminSql.where(conditions),
                "occurred_at DESC, audit_id", params, page, ENTRY);
    }
}
