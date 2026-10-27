package com.avengers.internal.analytics;

import com.avengers.internal.common.Rows;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import com.avengers.internal.security.CurrentUserId;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;

/** Queue manual publication without running ETL on an HTTP request thread. */
@RestController
@RequestMapping("/api/v1/analytics/report-requests")
public class ReportRequestController {
    private final NamedParameterJdbcTemplate jdbc;
    public ReportRequestController(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    public Map<String,Object> request(@CurrentUserId UUID actor) {
        // Shared queue: concurrent clicks and retries reuse outstanding/recent work.
        jdbc.getJdbcTemplate().execute("SELECT pg_advisory_xact_lock(721919)");
        var existing = jdbc.query("""
                SELECT * FROM integration.report_requests
                WHERE status='queued' OR (status='published' AND cutoff_at > clock_timestamp()-interval '1 minute')
                ORDER BY cutoff_at DESC LIMIT 1
                """, Map.of(), Rows::read);
        if (!existing.isEmpty()) return existing.getFirst();
        return jdbc.query("""
                INSERT INTO integration.report_requests(request_id,requested_by)
                VALUES (:id,:actor) RETURNING *
                """, Map.of("id", UUID.randomUUID(), "actor", actor), Rows::read).getFirst();
    }
}
