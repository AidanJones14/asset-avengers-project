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
    // Locking (order freeze fix): there is no cache-wide lock. A slow provider call for one symbol must
    // not make every other quote, and every order holding row locks, wait behind it.
    // - the map is locked only for a get or put
    // - display misses for the same symbol share one provider call (Fauxnance's daily limit), through a
    //   fixed set of lock stripes, so arbitrary symbols can't grow memory
    // - the reporting event is published after every lock is released
    private final Object[] stripes = java.util.stream.IntStream.range(0, 64).mapToObj(i -> new Object()).toArray();

    public QuoteResponse display(String symbol) {
        String key = symbol.trim().toUpperCase();
        QuoteResponse cached = cached(key);
        if (cached != null) return cached;
        QuoteResponse quote;
        synchronized (stripes[Math.floorMod(key.hashCode(), stripes.length)]) {
            cached = cached(key);
            if (cached != null) return cached;
            quote = fetchAndStore(key);
        }
        publish(quote);
        return quote;
    }
    public QuoteResponse fresh(String symbol) {
        QuoteResponse quote = fetchAndStore(symbol.trim().toUpperCase());
        publish(quote);
        return quote;
    }
    private QuoteResponse cached(String key) {
        Entry entry;
        synchronized (quotes) { entry = quotes.get(key); }
        return entry != null && clock.instant().isBefore(entry.fetchedAt().plus(ttl)) ? entry.quote() : null;
    }
    private QuoteResponse fetchAndStore(String key) {
        QuoteResponse quote = pricing.getQuote(key);
        if (usable(quote)) {
            synchronized (quotes) {
                if (quotes.size() >= 512 && !quotes.containsKey(key)) quotes.remove(quotes.keySet().iterator().next());
                quotes.put(key, new Entry(quote, clock.instant()));
            }
        }
        return quote;
    }
    private void publish(QuoteResponse quote) {
        if (events == null || !usable(quote)) return;
        try { events.publishEvent(quote); }
        catch (RuntimeException failure) {
            // Reporting can recover on a later quote; do not break execution.
            log.warn("Reporting mark could not be saved ({})", failure.getClass().getSimpleName());
        }
    }
    private static boolean usable(QuoteResponse quote) {
        return quote != null && quote.price() != null && quote.price().signum() > 0;
    }
}
