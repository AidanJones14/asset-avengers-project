package com.avengers.endgame.tradingcontrol;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.slf4j.LoggerFactory;
import java.util.UUID;

@Component
@EnableScheduling
@ConditionalOnProperty(name = "admin.suspensions.enabled", havingValue = "true", matchIfMissing = true)
public class AccountSuspensionWorker {
    private final JdbcTemplate jdbc;
    private final AccountSuspensionSchedules schedules;
    public AccountSuspensionWorker(JdbcTemplate jdbc, AccountSuspensionSchedules schedules) {
        this.jdbc = jdbc;
        this.schedules = schedules;
    }
    @Scheduled(fixedDelayString = "${admin.suspensions.poll-delay-ms:1000}")
    public void runDueSchedules() {
        var ids = jdbc.queryForList("SELECT account_id FROM account_suspension_schedules WHERE suspend_at <= CURRENT_TIMESTAMP ORDER BY suspend_at LIMIT 100", UUID.class);
        for (UUID id : ids) {
            try { schedules.execute(id); }
            catch (RuntimeException ex) {
                LoggerFactory.getLogger(getClass()).error("Could not execute suspension for account {}", id, ex);
            }
        }
    }
}
