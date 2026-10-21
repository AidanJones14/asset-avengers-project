package com.avengers.endgame.order.service;

import com.avengers.endgame.integration.pricing.client.PricingApiClient;
import com.avengers.endgame.integration.pricing.dto.QuoteResponse;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.*;
import java.util.LinkedHashMap;
import java.util.Map;

/** Shared display quotes; order validation and execution explicitly bypass this cache. */
@Component
public class QuoteCache {
    private record Entry(QuoteResponse quote, Instant fetchedAt) {}
    private final PricingApiClient pricing;
    private final Duration ttl;
    private final Clock clock;
    private final Map<String, Entry> quotes = new LinkedHashMap<>();
    private org.springframework.context.ApplicationEventPublisher events;
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(QuoteCache.class);
    @Autowired
    public QuoteCache(PricingApiClient pricing, @Value("${pricing.api.display-cache-ttl:PT1M}") Duration ttl,
                      org.springframework.context.ApplicationEventPublisher events) {
        this(pricing, ttl, Clock.systemUTC());
        this.events = events;
    }
    public QuoteCache(PricingApiClient pricing, Duration ttl) { this(pricing, ttl, Clock.systemUTC()); }
    public QuoteCache(PricingApiClient pricing, Duration ttl, Clock clock) {
        this.pricing = pricing; this.ttl = ttl; this.clock = clock;
    }
    public synchronized QuoteResponse display(String symbol) {
        symbol = symbol.trim().toUpperCase();
        var cached = quotes.get(symbol);
        if (cached != null && clock.instant().isBefore(cached.fetchedAt().plus(ttl))) return cached.quote();
        return fresh(symbol);
    }
    public synchronized QuoteResponse fresh(String symbol) {
        symbol = symbol.trim().toUpperCase();
        QuoteResponse quote = pricing.getQuote(symbol);
        if (quote != null && quote.price() != null && quote.price().signum() > 0) {
            if (quotes.size() >= 512 && !quotes.containsKey(symbol)) quotes.remove(quotes.keySet().iterator().next());
            quotes.put(symbol, new Entry(quote, clock.instant()));
            if (events != null) {
                try { events.publishEvent(quote); }
                catch (RuntimeException failure) {
                    // Reporting can recover on a later quote; do not break execution.
                    log.warn("Reporting mark could not be saved ({})", failure.getClass().getSimpleName());
                }
            }
        }
        return quote;
    }
}
