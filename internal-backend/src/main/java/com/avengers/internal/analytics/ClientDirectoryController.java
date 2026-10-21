package com.avengers.internal.analytics;

import com.avengers.internal.common.Rows;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.*;

/** Both staff roles may search names; this never exposes emails or account balances. */
@RestController
@RequestMapping("/api/v1/analytics/clients")
public class ClientDirectoryController {
    private final NamedParameterJdbcTemplate jdbc;
    public ClientDirectoryController(@Qualifier("adminAnalytics") NamedParameterJdbcTemplate jdbc) { this.jdbc=jdbc; }
    @GetMapping("/suggestions")
    public List<Map<String,Object>> suggestions(@RequestParam @Size(max=100) String q) {
        if (q.isBlank()) return List.of();
        String pattern="%"+q.strip().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
        return jdbc.query("""
                SELECT client_id,first_name,last_name,full_name FROM reporting.client_directory
                WHERE full_name ILIKE :pattern ESCAPE '\\' OR first_name ILIKE :pattern ESCAPE '\\'
                   OR last_name ILIKE :pattern ESCAPE '\\'
                ORDER BY full_name,client_id LIMIT 10
                """,Map.of("pattern",pattern),Rows::read);
    }
    /** Current copied valuation; incomplete portfolios remain unclassified. */
    @GetMapping("/portfolios")
    public List<Map<String,Object>> portfolios(@RequestParam(defaultValue="") String portfolioClass,
                                              @RequestParam(defaultValue="") @Size(max=100) String q) {
        if (!Set.of("", "A", "B", "C", "unclassified").contains(portfolioClass))
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Invalid portfolio class");
        String pattern="%"+q.strip().replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
        return jdbc.query("""
                SELECT * FROM reporting.client_portfolios
                WHERE (:class='' OR portfolio_class=:class
                       OR (:class='unclassified' AND portfolio_class IS NULL))
                  AND client_name ILIKE :pattern ESCAPE '\\'
                ORDER BY portfolio_value DESC NULLS LAST,client_id LIMIT 100
                """,Map.of("class",portfolioClass,"pattern",pattern),Rows::read);
    }
    /** Investment account names/types only: no bank credentials or client email. */
    @GetMapping("/{id}/accounts")
    public List<Map<String,Object>> accounts(@PathVariable UUID id) {
        return jdbc.query("""
                SELECT account_id,account_name,account_type,is_suspended,as_of
                FROM reporting.investment_accounts WHERE client_id=:id ORDER BY account_name,account_id
                """,Map.of("id",id),Rows::read);
    }
    @GetMapping("/{id}/activity")
    public List<Map<String,Object>> activity(@PathVariable UUID id) {
        return jdbc.query("""
                SELECT report_date,account_id,account_name,account_type,count(*) AS trade_count,sum(cash_amount) AS traded_notional
                FROM analytics.named_published_trades WHERE client_id=:id
                GROUP BY report_date,account_id,account_name,account_type
                ORDER BY report_date DESC,account_id LIMIT 100
                """,Map.of("id",id),Rows::read);
    }
}
