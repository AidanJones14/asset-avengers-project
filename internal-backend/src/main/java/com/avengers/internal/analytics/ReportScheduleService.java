package com.avengers.internal.analytics;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class ReportScheduleService {
    static final ZoneId ZONE = ZoneId.of("America/New_York");
    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    public ReportScheduleService(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }
    public record Schedule(String timezone, String currentLocalTime, String nextLocalTime, LocalDate effectiveFrom) {}
    private String timeFor(LocalDate day) {
        var values = jdbc.query("""
                SELECT cutoff_local_time FROM integration.report_schedules WHERE effective_from <= :day
                ORDER BY effective_from DESC,changed_at DESC,schedule_id DESC LIMIT 1
                """, Map.of("day", day), (rs, row) -> rs.getTime(1).toLocalTime().toString());
        return values.isEmpty() ? "19:00" : values.getFirst();
    }
    @Transactional(readOnly = true)
    public Schedule get() {
        LocalDate today = LocalDate.now(clock.withZone(ZONE));
        return new Schedule(ZONE.getId(), timeFor(today), timeFor(today.plusDays(1)), today.plusDays(1));
    }
    @Transactional
    public Schedule save(String localTime, UUID actor) {
        LocalDate effective = LocalDate.now(clock.withZone(ZONE)).plusDays(1);
        // One shared daily setting; concurrent changes retain all versions, newest wins.
        jdbc.getJdbcTemplate().execute("SELECT pg_advisory_xact_lock(721917)");
        jdbc.update("""
                INSERT INTO integration.report_schedules(schedule_id,effective_from,cutoff_local_time,changed_by)
                VALUES (:id,:effective,CAST(:time AS time),:actor)
                """, Map.of("id", UUID.randomUUID(), "effective", effective, "time", localTime, "actor", actor));
        return get();
    }
}
