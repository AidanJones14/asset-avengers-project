-- Admin and analytics database schema
-- PostgreSQL 13+
--
-- Create this database separately, then run this file while connected to it:
--   CREATE DATABASE admin_analytics;
--
-- This database is populated by an outbox/CDC/ETL process from the live trading
-- database. It deliberately contains no credentials, passwords, or cross-
-- database foreign keys and is never used by the order execution path.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS reporting;

-- ============================================================
-- Reference and control state
-- ============================================================
CREATE TABLE IF NOT EXISTS client_accounts (
    client_id       UUID PRIMARY KEY,
    account_id      UUID NOT NULL UNIQUE,
    client_segment  VARCHAR(50),
    account_status  VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'suspended', 'closed')),
    status_reason   TEXT,
    status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_updated_at TIMESTAMPTZ NOT NULL,
    loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_client_status
    ON client_accounts (account_status);

CREATE TABLE IF NOT EXISTS instrument_controls (
    instrument_id       UUID PRIMARY KEY,
    symbol              VARCHAR(20) NOT NULL,
    instrument_name     VARCHAR(255),
    security_type       VARCHAR(30),
    is_suspended        BOOLEAN NOT NULL DEFAULT FALSE,
    suspension_reason   TEXT,
    status_changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_updated_at   TIMESTAMPTZ NOT NULL,
    loaded_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_instrument_symbol
    ON instrument_controls (symbol);

-- Every client and instrument state change remains queryable after the current
-- state row has changed.
CREATE TABLE IF NOT EXISTS client_status_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    old_status      VARCHAR(20),
    new_status      VARCHAR(20) NOT NULL
        CHECK (new_status IN ('active', 'suspended', 'closed')),
    reason          TEXT,
    changed_by      UUID,
    changed_at      TIMESTAMPTZ NOT NULL,
    source_event_id UUID,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_status_history_client_time
    ON client_status_history (client_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS instrument_status_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instrument_id   UUID NOT NULL,
    old_suspended   BOOLEAN,
    new_suspended   BOOLEAN NOT NULL,
    reason          TEXT,
    changed_by      UUID,
    changed_at      TIMESTAMPTZ NOT NULL,
    source_event_id UUID,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instrument_status_history_time
    ON instrument_status_history (instrument_id, changed_at DESC);

-- ============================================================
-- Read-only positions and trade lifecycle facts
-- ============================================================
CREATE TABLE IF NOT EXISTS position_snapshots (
    snapshot_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    instrument_id   UUID NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    quantity        NUMERIC(18, 4) NOT NULL CHECK (quantity >= 0),
    market_price    NUMERIC(18, 4) CHECK (market_price >= 0),
    market_value    NUMERIC(20, 2) CHECK (market_value >= 0),
    cash_balance    NUMERIC(20, 2) NOT NULL CHECK (cash_balance >= 0),
    captured_at     TIMESTAMPTZ NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (account_id, instrument_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_position_snapshots_client_time
    ON position_snapshots (client_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS trade_records (
    trade_id        UUID PRIMARY KEY,
    order_id        UUID NOT NULL UNIQUE,
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    instrument_id   UUID NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    order_side      VARCHAR(10) NOT NULL CHECK (order_side IN ('buy', 'sell')),
    order_type      VARCHAR(20) NOT NULL,
    quantity        NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    limit_price     NUMERIC(18, 4),
    final_price     NUMERIC(18, 4),
    final_status    VARCHAR(20) NOT NULL
        CHECK (final_status IN ('placed', 'priced', 'accepted', 'filled', 'rejected', 'cancelled')),
    rejection_reason TEXT,
    placed_at       TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    source_updated_at TIMESTAMPTZ NOT NULL,
    CHECK (final_status <> 'rejected' OR rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_trade_records_client_time
    ON trade_records (client_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_records_instrument_time
    ON trade_records (instrument_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_records_status
    ON trade_records (final_status);

CREATE TABLE IF NOT EXISTS trade_lifecycle_events (
    event_id        UUID PRIMARY KEY,
    trade_id        UUID NOT NULL REFERENCES trade_records (trade_id) ON DELETE RESTRICT,
    order_id        UUID NOT NULL,
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    instrument_id   UUID NOT NULL,
    event_type      VARCHAR(20) NOT NULL
        CHECK (event_type IN ('placed', 'priced', 'accepted', 'filled', 'rejected', 'cancelled')),
    event_at        TIMESTAMPTZ NOT NULL,
    quantity        NUMERIC(18, 4) CHECK (quantity > 0),
    price           NUMERIC(18, 4) CHECK (price > 0),
    rejection_reason TEXT,
    source_event_id UUID,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trade_id, event_type, event_at)
);

CREATE INDEX IF NOT EXISTS idx_trade_events_trade_time
    ON trade_lifecycle_events (trade_id, event_at);
CREATE INDEX IF NOT EXISTS idx_trade_events_client_time
    ON trade_lifecycle_events (client_id, event_at DESC);

CREATE TABLE IF NOT EXISTS cash_holding_changes (
    change_id       UUID PRIMARY KEY,
    trade_id        UUID REFERENCES trade_records (trade_id) ON DELETE RESTRICT,
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    instrument_id   UUID,
    change_type     VARCHAR(30) NOT NULL CHECK (change_type IN
        ('trade_cash', 'trade_holding', 'deposit', 'withdrawal', 'dividend')),
    cash_delta      NUMERIC(20, 2) NOT NULL DEFAULT 0,
    holding_delta   NUMERIC(18, 4) NOT NULL DEFAULT 0,
    cash_balance_after NUMERIC(20, 2) CHECK (cash_balance_after >= 0),
    holding_quantity_after NUMERIC(18, 4) CHECK (holding_quantity_after >= 0),
    occurred_at     TIMESTAMPTZ NOT NULL,
    source_event_id UUID,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_holding_changes_client_time
    ON cash_holding_changes (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_holding_changes_trade
    ON cash_holding_changes (trade_id);

-- ============================================================
-- Admin audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
    audit_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL,
    actor_role      VARCHAR(20) NOT NULL CHECK (actor_role IN ('admin', 'analyst')),
    action          VARCHAR(40) NOT NULL CHECK (action IN
        ('view_client_positions', 'view_trade', 'suspend_client',
         'unsuspend_client', 'suspend_instrument', 'unsuspend_instrument',
         'export_report', 'change_permission')),
    target_client_id UUID,
    target_account_id UUID,
    target_instrument_id UUID,
    target_trade_id  UUID,
    target_user_id   UUID,
    request_id       UUID,
    reason           TEXT,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_time
    ON admin_audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_client_time
    ON admin_audit_log (target_client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_time
    ON admin_audit_log (action, occurred_at DESC);

-- ============================================================
-- Reporting facts and export-friendly views
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_client_activity (
    activity_date       DATE NOT NULL,
    client_id           UUID NOT NULL,
    client_segment      VARCHAR(50),
    portfolio_value     NUMERIC(20, 2) NOT NULL CHECK (portfolio_value >= 0),
    trade_count         INTEGER NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
    traded_notional     NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (traded_notional >= 0),
    login_count         INTEGER NOT NULL DEFAULT 0 CHECK (login_count >= 0),
    last_login_at       TIMESTAMPTZ,
    PRIMARY KEY (activity_date, client_id)
);

CREATE TABLE IF NOT EXISTS daily_instrument_activity (
    activity_date       DATE NOT NULL,
    instrument_id       UUID NOT NULL,
    symbol              VARCHAR(20) NOT NULL,
    trade_count         INTEGER NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
    traded_quantity     NUMERIC(20, 4) NOT NULL DEFAULT 0 CHECK (traded_quantity >= 0),
    traded_notional     NUMERIC(20, 2) NOT NULL DEFAULT 0 CHECK (traded_notional >= 0),
    active_client_count INTEGER NOT NULL DEFAULT 0 CHECK (active_client_count >= 0),
    PRIMARY KEY (activity_date, instrument_id)
);

CREATE TABLE IF NOT EXISTS monthly_client_segments (
    month_start         DATE NOT NULL,
    client_id           UUID NOT NULL,
    portfolio_size_band VARCHAR(20) NOT NULL CHECK (portfolio_size_band IN ('under_10k', '10k_100k', 'over_100k')),
    activity_level      VARCHAR(20) NOT NULL CHECK (activity_level IN ('active', 'occasional', 'dormant')),
    trade_count         INTEGER NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
    login_count         INTEGER NOT NULL DEFAULT 0 CHECK (login_count >= 0),
    portfolio_value     NUMERIC(20, 2) NOT NULL CHECK (portfolio_value >= 0),
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (month_start, client_id)
);

CREATE OR REPLACE VIEW reporting.trade_lifecycle_report AS
SELECT tr.client_id, tr.account_id, tr.trade_id, tr.order_id, tr.symbol,
       tr.order_side, tr.quantity, tr.final_status, tr.rejection_reason,
       tr.placed_at, tr.completed_at, tle.event_type, tle.event_at,
       tle.price AS event_price
FROM trade_records tr
JOIN trade_lifecycle_events tle ON tle.trade_id = tr.trade_id;

CREATE OR REPLACE VIEW reporting.monthly_activity_report AS
SELECT month_start, portfolio_size_band, activity_level,
       count(*) AS client_count,
       sum(trade_count) AS trade_count,
       sum(login_count) AS login_count,
       sum(portfolio_value) AS portfolio_value
FROM monthly_client_segments
GROUP BY month_start, portfolio_size_band, activity_level;

CREATE OR REPLACE VIEW reporting.instrument_activity_report AS
SELECT activity_date, instrument_id, symbol, trade_count,
       traded_quantity, traded_notional, active_client_count
FROM daily_instrument_activity;

-- ============================================================
-- Append-only enforcement for facts and audit records
-- ============================================================
CREATE OR REPLACE FUNCTION block_admin_analytics_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; updates and deletes are prohibited', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'client_status_history', 'instrument_status_history',
        'position_snapshots', 'trade_records', 'trade_lifecycle_events',
        'cash_holding_changes', 'admin_audit_log', 'daily_client_activity',
        'daily_instrument_activity', 'monthly_client_segments'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_append_only_%I ON %I', table_name, table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_append_only_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION block_admin_analytics_mutation()',
            table_name, table_name
        );
    END LOOP;
END $$;

-- Separate database roles: membership/login policy is managed by deployment,
-- while these grants prevent analysts from changing reporting data.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_admin') THEN
        CREATE ROLE analytics_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_analyst') THEN
        CREATE ROLE analytics_analyst NOLOGIN;
    END IF;
END $$;

GRANT USAGE ON SCHEMA reporting TO analytics_admin, analytics_analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO analytics_admin, analytics_analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_analyst;
GRANT SELECT, INSERT ON client_status_history, instrument_status_history,
    admin_audit_log TO analytics_admin;
GRANT SELECT, INSERT, UPDATE ON client_accounts, instrument_controls TO analytics_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_admin, analytics_analyst;

ALTER DEFAULT PRIVILEGES IN SCHEMA reporting
    GRANT SELECT ON TABLES TO analytics_admin, analytics_analyst;
ALTER DEFAULT PRIVILEGES
    GRANT SELECT ON TABLES TO analytics_analyst;
