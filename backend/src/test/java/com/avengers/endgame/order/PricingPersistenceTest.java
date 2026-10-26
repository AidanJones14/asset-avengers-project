package com.avengers.endgame.order;

import com.avengers.endgame.order.service.*;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Run only against the isolated disposable Postgres started for pricing tests. */
@EnabledIfSystemProperty(named = "pricing.test.jdbc-url", matches = ".+")
class PricingPersistenceTest {
    private JdbcTemplate jdbc;
    private Clock clock;
    private final AtomicReference<Instant> now = new AtomicReference<>();
    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource(System.getProperty("pricing.test.jdbc-url"), "postgres", "pricing-test-only");
        jdbc = new JdbcTemplate(source);
        for (String sql : Files.readString(Path.of("../DB/quote_cache.sql")).split(";"))
            if (!sql.isBlank()) jdbc.execute(sql);
        jdbc.execute("TRUNCATE market_quote_cache,pricing_request_budget");
        now.set(Instant.parse("2026-10-26T23:59:00Z"));
        clock = mock(Clock.class);
        when(clock.instant()).thenAnswer(call -> now.get());
    }
    @Test void concurrentReservationsCannotExceedLimitsAndSearchReserveSurvivesRestart() throws Exception {
        var budget = new PricingRequestBudget(jdbc, 10, 15, clock);
        try (var pool = Executors.newFixedThreadPool(12)) {
            var jobs = new java.util.ArrayList<Future<Boolean>>();
            for (int i=0;i<40;i++) jobs.add(pool.submit(() -> budget.reserve(false)));
            int allowed=0;
            for (var job:jobs) if (job.get(10, TimeUnit.SECONDS)) allowed++;
            assertEquals(10, allowed);
        }
        var restarted = new PricingRequestBudget(jdbc, 10, 15, clock);
        assertFalse(restarted.reserve(false));
        for (int i=0;i<5;i++) assertTrue(restarted.reserve(true));
        assertFalse(restarted.reserve(true));
        assertEquals(15, jdbc.queryForObject("SELECT request_count FROM pricing_request_budget", Integer.class));
        now.set(Instant.parse("2026-10-27T00:00:01Z"));
        assertTrue(restarted.reserve(false));
    }
    @Test void providerPauseSurvivesRestartAndExpiresAtReset() {
        var budget = new PricingRequestBudget(jdbc, 10, 15, clock);
        budget.pauseUntil(Instant.parse("2026-10-27T00:00:00Z"));
        var restarted = new PricingRequestBudget(jdbc, 10, 15, clock);
        assertFalse(restarted.reserve(false));
        assertFalse(restarted.reserve(true));
        now.set(Instant.parse("2026-10-27T00:00:01Z"));
        assertTrue(restarted.reserve(false));
    }
    @Test void transientPauseStillAppliesWhenItCrossesUtcMidnight() {
        new PricingRequestBudget(jdbc, 10, 15, clock).pauseUntil(Instant.parse("2026-10-27T00:01:00Z"));
        now.set(Instant.parse("2026-10-27T00:00:01Z"));
        assertFalse(new PricingRequestBudget(jdbc, 10, 15, clock).reserve(true));
        now.set(Instant.parse("2026-10-27T00:01:01Z"));
        assertTrue(new PricingRequestBudget(jdbc, 10, 15, clock).reserve(false));
    }
    @Test void fullQuotesSurviveRestartAndOlderObservationsCannotOverwriteThem() {
        var json = new ObjectMapper().findAndRegisterModules();
        var original = quote(now.get());
        new SavedQuoteRepository(jdbc, json).save("AAPL", original, now.get());
        var restarted = new SavedQuoteRepository(jdbc, json);
        assertEquals(original, restarted.find("AAPL").orElseThrow().quote());
        restarted.save("AAPL", quote(now.get().minusSeconds(600)), now.get());
        assertEquals(original, restarted.find("AAPL").orElseThrow().quote());
    }
    private QuoteResponse quote(Instant at) {
        return new QuoteResponse("AAPL", BigDecimal.TEN, new BigDecimal("9.99"), new BigDecimal("10.01"), null,
                "USD", null,null,null,at,"CLOSED",false,"provider");
    }
}
