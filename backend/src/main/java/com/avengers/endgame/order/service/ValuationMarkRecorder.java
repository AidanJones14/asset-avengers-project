package com.avengers.endgame.order.service;

import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.Instant;

/** Reuse observed quotes for asynchronous reporting; never call the provider here. */
@Component
public class ValuationMarkRecorder {
    private final JdbcTemplate jdbc;
    public ValuationMarkRecorder(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @EventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(QuoteResponse quote) {
        Instant now = Instant.now();
        if (quote.symbol() == null || quote.price() == null || quote.price().signum() <= 0
                || quote.currency() == null || quote.asOf() == null
                || quote.asOf().isAfter(now.plusSeconds(5))) return;
        // Ignore late responses; the outbox row commits with this mark update.
        jdbc.update("""
            INSERT INTO instrument_marks(symbol,price,currency,quote_at,observed_at,provider_stale)
            VALUES (?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET
            price=EXCLUDED.price,currency=EXCLUDED.currency,quote_at=EXCLUDED.quote_at,
            observed_at=EXCLUDED.observed_at,provider_stale=EXCLUDED.provider_stale
            WHERE EXCLUDED.quote_at >= instrument_marks.quote_at
            """, quote.symbol().trim().toUpperCase(java.util.Locale.ROOT), quote.price(),
                quote.currency().toUpperCase(java.util.Locale.ROOT), Timestamp.from(quote.asOf()),
                Timestamp.from(now), Boolean.TRUE.equals(quote.stale()));
    }
}
