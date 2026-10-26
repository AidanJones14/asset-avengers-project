package com.avengers.endgame.order.service;

import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

@Repository
@ConditionalOnProperty(name = "pricing.api.persistence.enabled", havingValue = "true", matchIfMissing = true)
public class SavedQuoteRepository {
    public record SavedQuote(QuoteResponse quote, Instant fetchedAt) {}
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public SavedQuoteRepository(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<SavedQuote> find(String symbol) {
        return jdbc.query("SELECT quote_json,fetched_at FROM market_quote_cache WHERE symbol = ?", (rs, i) -> {
            try { return new SavedQuote(json.readValue(rs.getString("quote_json"), QuoteResponse.class),
                    rs.getTimestamp("fetched_at").toInstant()); }
            catch (Exception ex) { throw new IllegalStateException("Saved quote could not be read", ex); }
        }, symbol).stream().findFirst();
    }

    // Quote observations survive a later order rollback or process restart.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void save(String symbol, QuoteResponse quote, Instant fetchedAt) {
        try {
            jdbc.update("""
                INSERT INTO market_quote_cache(symbol,quote_json,quote_at,fetched_at) VALUES (?,?,?,?)
                ON CONFLICT(symbol) DO UPDATE SET quote_json=EXCLUDED.quote_json,
                    quote_at=EXCLUDED.quote_at,fetched_at=EXCLUDED.fetched_at
                WHERE EXCLUDED.quote_at >= market_quote_cache.quote_at
                """, symbol, json.writeValueAsString(quote), Timestamp.from(quote.asOf()), Timestamp.from(fetchedAt));
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw new IllegalStateException("Quote could not be saved", ex);
        }
    }
}
