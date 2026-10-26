-- Full provider quotes and a UTC-day request budget. Reapplying preserves data.
CREATE TABLE IF NOT EXISTS market_quote_cache (
    symbol TEXT PRIMARY KEY,
    quote_json TEXT NOT NULL,
    quote_at TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS pricing_request_budget (
    budget_day DATE PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    blocked_until TIMESTAMPTZ
);
