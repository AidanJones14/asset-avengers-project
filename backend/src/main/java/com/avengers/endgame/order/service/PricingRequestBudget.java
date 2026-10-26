package com.avengers.endgame.order.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.*;

@Service
@ConditionalOnProperty(name = "pricing.api.persistence.enabled", havingValue = "true", matchIfMissing = true)
public class PricingRequestBudget {
    private final JdbcTemplate jdbc;
    private final int automaticLimit;
    private final int totalLimit;
    private final Clock clock;
    @Autowired
    public PricingRequestBudget(JdbcTemplate jdbc,
            @Value("${pricing.api.automatic-daily-limit:1500}") int automaticLimit,
            @Value("${pricing.api.total-daily-limit:1800}") int totalLimit) {
        this(jdbc, automaticLimit, totalLimit, Clock.systemUTC());
    }
    public PricingRequestBudget(JdbcTemplate jdbc, int automaticLimit, int totalLimit, Clock clock) {
        if (automaticLimit < 1 || totalLimit < automaticLimit || totalLimit > 2000)
            throw new IllegalArgumentException("Pricing limits must satisfy 1 <= automatic <= total <= 2000");
        this.jdbc = jdbc; this.automaticLimit = automaticLimit; this.totalLimit = totalLimit; this.clock = clock;
    }
    // Atomic reservation shared by backend replicas; failed provider calls count too.
    // Commit before the network call, independently of any enclosing order transaction.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean reserve(boolean interactive) {
        Instant now = clock.instant();
        Date day = Date.valueOf(now.atZone(ZoneOffset.UTC).toLocalDate());
        jdbc.update("INSERT INTO pricing_request_budget(budget_day) VALUES (?) ON CONFLICT DO NOTHING", day);
        return jdbc.update("""
            UPDATE pricing_request_budget SET request_count=request_count+1
            WHERE budget_day=? AND request_count<?
              AND NOT EXISTS (SELECT 1 FROM pricing_request_budget WHERE blocked_until>?)
            """, day, interactive ? totalLimit : automaticLimit, Timestamp.from(now)) == 1;
    }
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void pauseUntil(Instant until) {
        Date day = Date.valueOf(clock.instant().atZone(ZoneOffset.UTC).toLocalDate());
        jdbc.update("""
            INSERT INTO pricing_request_budget(budget_day,blocked_until) VALUES (?,?)
            ON CONFLICT(budget_day) DO UPDATE SET blocked_until=
                GREATEST(pricing_request_budget.blocked_until,EXCLUDED.blocked_until)
            """, day, Timestamp.from(until));
    }
}
