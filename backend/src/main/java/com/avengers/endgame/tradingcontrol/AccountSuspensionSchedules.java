package com.avengers.endgame.tradingcontrol;

import com.avengers.endgame.account.AccountRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Service
public class AccountSuspensionSchedules {
    private final JdbcTemplate jdbc;
    private final AccountRepository accounts;
    private final AdminSuspensionService commands;

    public AccountSuspensionSchedules(JdbcTemplate jdbc, AccountRepository accounts, AdminSuspensionService commands) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.commands = commands;
    }

    @Transactional
    public Map<String, Object> schedule(UUID accountId, ScheduledSuspensionRequest request, AdminActor actor) {
        if (request.suspendAt() == null || !request.suspendAt().isAfter(Instant.now()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Suspension date must be in the future");
        var account = accounts.findByIdForUpdate(accountId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));
        if (account.isSuspended())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Account is already suspended");
        UUID id = UUID.randomUUID();
        // One pending schedule per account; a new schedule replaces the previous one.
        jdbc.update("DELETE FROM account_suspension_schedules WHERE account_id = ?", accountId);
        jdbc.update("""
                INSERT INTO account_suspension_schedules
                    (schedule_id, account_id, suspend_at, reason, actor_id, actor_email)
                VALUES (?, ?, ?, ?, ?, ?)
                """, id, accountId, Timestamp.from(request.suspendAt()), request.reason().trim(), actor.userId(), actor.email());
        account.setSuspensionReason(request.reason().trim());
        account.setScheduledSuspensionAt(request.suspendAt());
        account.setUpdatedAt(Instant.now());
        accounts.saveAndFlush(account);
        return Map.of("scheduleId", id, "suspendAt", request.suspendAt());
    }

    @Transactional
    public void execute(UUID accountId) {
        // Account lock also serializes scheduling, immediate commands, and trading.
        var account = accounts.findByIdForUpdate(accountId).orElse(null);
        if (account == null) return;
        var rows = jdbc.queryForList("""
                SELECT * FROM account_suspension_schedules
                WHERE account_id = ? AND suspend_at <= CURRENT_TIMESTAMP FOR UPDATE
                """, accountId);
        for (var row : rows) {
            if (!account.isSuspended()) {
                commands.setAccountSuspended(accountId, true, (String) row.get("reason"),
                        new AdminActor((UUID) row.get("actor_id"), (String) row.get("actor_email")));
            }
            jdbc.update("DELETE FROM account_suspension_schedules WHERE schedule_id = ?", row.get("schedule_id"));
        }
    }
}
