# Pricing cache and request budget

The simulator shares one provider quote per symbol for **15 minutes** across client
refreshes, explicit stock searches, order submission, and execution. The browser
checks displayed prices every 60 seconds while visible; most checks use the cache.
A request for the same symbol arriving during a fetch waits for that fetch instead
of making a duplicate provider call. A slow symbol does not block unrelated symbols.

Full quotes (including bid, ask, currency and observation timestamp) are saved in
`market_quote_cache`. Restarts reload them. Newer observations cannot be replaced
by older observations. The reference valuation marks table is not used as an
execution fallback because it does not store bid/ask prices.

When a refresh fails or a request budget is unavailable, an existing validated saved
quote remains usable for simulated trading. Responses preserve its observation
timestamp, set `stale=true`, and label `source=saved-cache`. No price is invented for
a symbol with no usable saved quote. Missing/nonpositive side prices, mismatched
symbol/currency, missing timestamps, or timestamps over five seconds in the future
are never saved as executable quotes.

| Setting | Default | Meaning |
|---|---|---|
| `PRICING_CACHE_TTL` | `PT15M` | Shared provider quote lifetime |
| `PRICING_AUTOMATIC_DAILY_LIMIT` | `1500` | Stop automatic/order provider calls after this total count |
| `PRICING_TOTAL_DAILY_LIMIT` | `1800` | Hard cap including explicit stock searches |

The last 300 app requests are reserved for explicit searches. The app leaves 200
requests below the provider's 2,000 daily allowance. Counters use UTC days, are
atomically reserved before network calls, and survive restarts and failed order
transactions. They cover this app/database, including replicas sharing the database;
other apps using the same provider key can still spend the provider's quota.

Provider daily-quota errors pause all new provider calls until midnight UTC.
Other rate limits respect numeric Retry-After headers or default to one minute.
Other pricing failures back off for five minutes per symbol. Saved prices remain
available during pauses; repeated polls do not call the provider again.

For ten continuously active symbols, scheduled quote refreshes use about **40 calls
per hour**, compared with 600 under the old one-minute cache. A larger watchlist
can reach the automatic cap; it then uses saved prices and preserves the search
reserve. Prices can therefore be older than fifteen minutes, intentionally, under the
simulator's latest-available-price policy. Client timestamps use Eastern Time.

Apply `DB/quote_cache.sql` before deploying the backend. The schema script includes
the same tables for new databases. Test suites use a zero-TTL, nonpersistent mode
for lifecycle tests that intentionally change mock prices between order steps;
dedicated cache and PostgreSQL tests exercise the production policy.
