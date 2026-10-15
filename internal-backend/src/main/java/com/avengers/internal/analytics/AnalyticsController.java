package com.avengers.internal.analytics;

import com.avengers.internal.common.Rows;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.*;

// The UI can show a failed/latest attempt alongside the last published report.
// These endpoints do not execute ETL or query the live trading database.
@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {
    private final NamedParameterJdbcTemplate jdbc;
    private final SupersetGateway superset;
    public AnalyticsController(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc,SupersetGateway superset) {
        this.jdbc=jdbc;this.superset=superset;
    }
    @GetMapping("/status")
    public Map<String,Object> status() {
        var result=new LinkedHashMap<String,Object>();
        result.put("reportingTimezone","America/New_York");
        result.put("cutoffLocalTime","19:00");
        result.put("coverage","Same day, midnight inclusive to 19:00 exclusive");
        result.put("pipeline",jdbc.query("SELECT *,extract(epoch FROM clock_timestamp()-source_heartbeat_at) AS lag_seconds FROM integration.pipeline_status WHERE pipeline='trading'",Map.of(),Rows::read).stream().findFirst().orElse(null));
        result.put("latestBatch",jdbc.query("SELECT * FROM integration.report_batches ORDER BY started_at DESC LIMIT 1",Map.of(),Rows::read).stream().findFirst().orElse(null));
        result.put("latestPublishedBatch",jdbc.query("SELECT b.* FROM integration.report_batches b JOIN integration.published_reports p USING(batch_id) ORDER BY p.report_date DESC LIMIT 1",Map.of(),Rows::read).stream().findFirst().orElse(null));
        return result;
    }
    @GetMapping("/dashboards")
    public List<Map<String,Object>> dashboards() {
        return jdbc.query("SELECT dashboard_key,title,embedded_id FROM integration.dashboard_registry ORDER BY dashboard_key",Map.of(),Rows::read);
    }
    @PostMapping("/dashboards/{key}/guest-token")
    public Map<String,Object> guestToken(@PathVariable String key) {return superset.guestToken(key);}
}
