-- Admin and analytics database schema
--
-- Create this database separately, then run this file while connected to it:
--   CREATE DATABASE admin_analytics;
--
-- This database is fed from Kafka: Debezium captures every committed change to
-- the trading database (orders, trade_fills, transactions, accounts, holdings,
-- instruments, users) and a consumer writes it here. It is never used by the
-- order execution path.
--
-- Suspensions are enforced in the trading database (accounts.is_suspended,
-- instruments.is_active). The admin backend writes the change there and
-- records it in admin_audit_log here; the consumer then mirrors the new state.
--
-- All report dates are UTC.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS admin;      -- admin-only views
CREATE SCHEMA IF NOT EXISTS reporting;  -- analyst (and admin) views

-- ============================================================
-- Current state mirrors (rewritten by the Kafka consumer, read-only for staff)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_accounts (
    account_id      UUID PRIMARY KEY,
    client_id       UUID NOT NULL,
    email           VARCHAR(255),           -- for admin lookup
    cash_balance    NUMERIC(18, 2) NOT NULL CHECK (cash_balance >= 0),
    is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
    source_updated_at TIMESTAMPTZ NOT NULL,
    loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_accounts_client ON client_accounts (client_id);
CREATE INDEX IF NOT EXISTS idx_client_accounts_email ON client_accounts (email);

CREATE TABLE IF NOT EXISTS client_positions (
    account_id      UUID NOT NULL,
    instrument_id   UUID NOT NULL,
    quantity        NUMERIC(18, 4) NOT NULL CHECK (quantity >= 0),
    source_updated_at TIMESTAMPTZ NOT NULL,
    loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS instruments (
    instrument_id   UUID PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(255),
    security_type   VARCHAR(30),
    is_tradable     BOOLEAN NOT NULL,       -- trading DB instruments.is_active
    source_updated_at TIMESTAMPTZ NOT NULL,
    loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Trade lifecycle facts (append-only, BR-14, BR-15, 9.4)
-- ============================================================
-- One row per order, written when it is placed (orders insert). Every status
-- change is a trade_lifecycle_events row, so nothing here ever changes.
CREATE TABLE IF NOT EXISTS trade_records (
    order_id        UUID PRIMARY KEY,
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    instrument_id   UUID NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    order_side      VARCHAR(10) NOT NULL CHECK (order_side IN ('buy', 'sell')),
    order_type      VARCHAR(20) NOT NULL CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
    quantity        NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    limit_price     NUMERIC(18, 4),
    stop_price      NUMERIC(18, 4),
    placed_at       TIMESTAMPTZ NOT NULL,   -- orders.date_placed
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_records_client_time
    ON trade_records (client_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_records_instrument_time
    ON trade_records (instrument_id, placed_at DESC);

-- One row per orders.status change, timestamped with orders.updated_at (fills use
-- trade_fills.executed_at). The unique key makes a replayed Kafka message a no-op.
CREATE TABLE IF NOT EXISTS trade_lifecycle_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES trade_records (order_id) ON DELETE RESTRICT,
    event_type      VARCHAR(20) NOT NULL
        CHECK (event_type IN ('accepted', 'submitted', 'filled', 'rejected', 'cancelled')),
    event_at        TIMESTAMPTZ NOT NULL,
    quantity        NUMERIC(18, 4) CHECK (quantity > 0),
    price           NUMERIC(18, 4) CHECK (price > 0),   -- fill price
    rejection_reason TEXT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, event_type, event_at),
    CHECK (event_type <> 'filled' OR (quantity IS NOT NULL AND price IS NOT NULL)),
    CHECK (event_type <> 'rejected' OR rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_trade_events_order_time
    ON trade_lifecycle_events (order_id, event_at);
CREATE INDEX IF NOT EXISTS idx_trade_events_type_time
    ON trade_lifecycle_events (event_type, event_at);

-- Cash and holding movements. Trades carry order_id; deposits, withdrawals and
-- dividends do not, but are kept so an account's cash history is complete.
CREATE TABLE IF NOT EXISTS cash_holding_changes (
    change_id       UUID PRIMARY KEY,       -- source fill/transaction id
    order_id        UUID REFERENCES trade_records (order_id) ON DELETE RESTRICT,
    client_id       UUID NOT NULL,
    account_id      UUID NOT NULL,
    instrument_id   UUID,
    change_type     VARCHAR(20) NOT NULL
        CHECK (change_type IN ('trade', 'deposit', 'withdrawal', 'dividend')),
    cash_delta      NUMERIC(18, 2) NOT NULL DEFAULT 0,
    holding_delta   NUMERIC(18, 4) NOT NULL DEFAULT 0,
    cash_balance_after NUMERIC(18, 2) CHECK (cash_balance_after >= 0),
    holding_quantity_after NUMERIC(18, 4) CHECK (holding_quantity_after >= 0),
    occurred_at     TIMESTAMPTZ NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((change_type = 'trade') = (order_id IS NOT NULL)),
    CHECK (change_type NOT IN ('trade', 'dividend') OR instrument_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cash_holding_changes_account_time
    ON cash_holding_changes (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_holding_changes_order
    ON cash_holding_changes (order_id) WHERE order_id IS NOT NULL;

-- ============================================================
-- Admin audit log (written by the admin backend)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
    audit_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        UUID NOT NULL,
    actor_email     VARCHAR(255),
    action          VARCHAR(30) NOT NULL CHECK (action IN
        ('view_client_account', 'view_trade',
         'suspend_client', 'unsuspend_client',
         'suspend_instrument', 'unsuspend_instrument')),
    target_account_id    UUID,
    target_instrument_id UUID,
    target_order_id      UUID,
    reason          TEXT,
    request_id      UUID,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (action NOT IN ('view_client_account', 'suspend_client', 'unsuspend_client')
           OR target_account_id IS NOT NULL),
    CHECK (action NOT IN ('suspend_instrument', 'unsuspend_instrument')
           OR target_instrument_id IS NOT NULL),
    CHECK (action <> 'view_trade' OR target_order_id IS NOT NULL),
    CHECK (action NOT LIKE '%suspend%' OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_time
    ON admin_audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_account_time
    ON admin_audit_log (target_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_time
    ON admin_audit_log (action, occurred_at DESC);

-- ============================================================
-- Monthly client segments (written once per month by the reporting job)
-- ============================================================
-- activity_level: 'active' means traded this month. The cut-off between
-- 'occasional' and 'dormant' is still to be decided and lives in the job.
CREATE TABLE IF NOT EXISTS monthly_client_segments (
    month_start         DATE NOT NULL CHECK (month_start = date_trunc('month', month_start)),
    client_id           UUID NOT NULL,
    portfolio_value     NUMERIC(20, 2) NOT NULL CHECK (portfolio_value >= 0), -- cash + holdings at month end
    portfolio_size_band VARCHAR(20) GENERATED ALWAYS AS (
        CASE WHEN portfolio_value < 10000 THEN 'under_10k'
             WHEN portfolio_value <= 100000 THEN '10k_100k'
             ELSE 'over_100k' END) STORED,
    trade_count         INTEGER NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
    activity_level      VARCHAR(20) NOT NULL CHECK (activity_level IN ('active', 'occasional', 'dormant')),
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (month_start, client_id),
    CHECK ((activity_level = 'active') = (trade_count > 0))
);

-- ============================================================
-- Admin views: read-only client account and trade lookup
-- ============================================================
CREATE OR REPLACE VIEW admin.client_accounts AS
SELECT ca.client_id, ca.account_id, ca.email, ca.cash_balance, ca.is_suspended,
       count(cp.instrument_id) FILTER (WHERE cp.quantity > 0) AS open_positions,
       ca.source_updated_at AS as_of
FROM client_accounts ca
LEFT JOIN client_positions cp ON cp.account_id = ca.account_id
GROUP BY ca.account_id;

CREATE OR REPLACE VIEW admin.client_positions AS
SELECT ca.client_id, cp.account_id, i.symbol, i.name AS instrument_name,
       cp.quantity, i.is_tradable, cp.source_updated_at AS as_of
FROM client_positions cp
JOIN client_accounts ca ON ca.account_id = cp.account_id
LEFT JOIN instruments i ON i.instrument_id = cp.instrument_id
WHERE cp.quantity > 0;

CREATE OR REPLACE VIEW admin.client_cash_history AS
SELECT c.client_id, c.account_id, c.occurred_at, c.change_type, i.symbol,
       c.order_id, c.cash_delta, c.cash_balance_after,
       c.holding_delta, c.holding_quantity_after
FROM cash_holding_changes c
LEFT JOIN instruments i ON i.instrument_id = c.instrument_id;

-- One row per order with its current status: the order history and trade lookup.
CREATE OR REPLACE VIEW admin.trades AS
SELECT tr.order_id, tr.client_id, tr.account_id, tr.symbol, tr.order_side,
       tr.order_type, tr.quantity, tr.limit_price, tr.stop_price,
       CASE WHEN e.filled_at IS NOT NULL THEN 'filled'
            WHEN e.rejected_at IS NOT NULL THEN 'rejected'
            WHEN e.cancelled_at IS NOT NULL THEN 'cancelled'
            WHEN e.submitted_at IS NOT NULL THEN 'submitted'
            ELSE 'accepted' END AS status,
       tr.placed_at, e.accepted_at, e.submitted_at,
       e.filled_at, e.fill_price, e.rejected_at, e.rejection_reason, e.cancelled_at,
       m.cash_change, m.holding_change
FROM trade_records tr
LEFT JOIN LATERAL (
    SELECT max(event_at) FILTER (WHERE event_type = 'accepted') AS accepted_at,
           max(event_at) FILTER (WHERE event_type = 'submitted') AS submitted_at,
           max(event_at) FILTER (WHERE event_type = 'filled') AS filled_at,
           max(price) FILTER (WHERE event_type = 'filled') AS fill_price,
           max(event_at) FILTER (WHERE event_type = 'rejected') AS rejected_at,
           max(rejection_reason) FILTER (WHERE event_type = 'rejected') AS rejection_reason,
           max(event_at) FILTER (WHERE event_type = 'cancelled') AS cancelled_at
    FROM trade_lifecycle_events
    WHERE order_id = tr.order_id
) e ON TRUE
LEFT JOIN LATERAL (
    SELECT sum(cash_delta) AS cash_change, sum(holding_delta) AS holding_change
    FROM cash_holding_changes
    WHERE order_id = tr.order_id
) m ON TRUE;

-- Full lifecycle of each order, one row per step, in time order.
CREATE OR REPLACE VIEW admin.trade_timeline AS
SELECT tr.order_id, tr.client_id, tr.account_id, tr.symbol,
       e.event_at AS occurred_at, e.event_type AS step,
       e.quantity, e.price, e.rejection_reason,
       NULL::NUMERIC(18, 2) AS cash_delta, NULL::NUMERIC(18, 2) AS cash_balance_after,
       NULL::NUMERIC(18, 4) AS holding_delta, NULL::NUMERIC(18, 4) AS holding_quantity_after
FROM trade_lifecycle_events e
JOIN trade_records tr ON tr.order_id = e.order_id
UNION ALL
SELECT tr.order_id, tr.client_id, tr.account_id, tr.symbol,
       c.occurred_at, 'cash_and_holding_change',
       NULL, NULL, NULL,
       c.cash_delta, c.cash_balance_after, c.holding_delta, c.holding_quantity_after
FROM cash_holding_changes c
JOIN trade_records tr ON tr.order_id = c.order_id;

CREATE OR REPLACE VIEW admin.audit_log AS
SELECT a.occurred_at, a.actor_email, a.actor_id, a.action, a.reason,
       ca.email AS target_client_email, a.target_account_id,
       i.symbol AS target_symbol, a.target_order_id, a.audit_id
FROM admin_audit_log a
LEFT JOIN client_accounts ca ON ca.account_id = a.target_account_id
LEFT JOIN instruments i ON i.instrument_id = a.target_instrument_id;

-- ============================================================
-- Analyst reporting views
-- ============================================================
CREATE OR REPLACE VIEW reporting.fills AS
SELECT e.order_id, tr.client_id, tr.instrument_id, tr.symbol, tr.order_side,
       e.quantity, e.price, round(e.quantity * e.price, 2) AS notional,
       e.event_at AS filled_at
FROM trade_lifecycle_events e
JOIN trade_records tr ON tr.order_id = e.order_id
WHERE e.event_type = 'filled';

-- Trading volumes over time
CREATE OR REPLACE VIEW reporting.daily_trading_volume AS
SELECT (filled_at AT TIME ZONE 'UTC')::date AS trade_date,
       count(*) AS trade_count,
       sum(quantity) AS traded_quantity,
       sum(notional) AS traded_notional,
       count(DISTINCT client_id) AS active_clients,
       count(DISTINCT instrument_id) AS instruments_traded
FROM reporting.fills
GROUP BY 1;

CREATE OR REPLACE VIEW reporting.daily_instrument_activity AS
SELECT (filled_at AT TIME ZONE 'UTC')::date AS trade_date,
       instrument_id, symbol,
       count(*) AS trade_count,
       sum(quantity) AS traded_quantity,
       sum(notional) AS traded_notional,
       count(DISTINCT client_id) AS active_clients
FROM reporting.fills
GROUP BY 1, instrument_id, symbol;

-- Most active instruments / instruments active in a period (dates inclusive):
--   SELECT * FROM reporting.instrument_activity('2026-09-01', '2026-09-30');
CREATE OR REPLACE FUNCTION reporting.instrument_activity(p_from DATE, p_to DATE)
RETURNS TABLE (activity_rank BIGINT, instrument_id UUID, symbol VARCHAR,
               trade_count BIGINT, traded_quantity NUMERIC, traded_notional NUMERIC,
               active_clients BIGINT)
LANGUAGE sql STABLE AS $$
    SELECT rank() OVER (ORDER BY count(*) DESC, sum(f.notional) DESC),
           f.instrument_id, f.symbol, count(*), sum(f.quantity), sum(f.notional),
           count(DISTINCT f.client_id)
    FROM reporting.fills f
    WHERE f.filled_at >= p_from::timestamp AT TIME ZONE 'UTC'
      AND f.filled_at < (p_to + 1)::timestamp AT TIME ZONE 'UTC'
    GROUP BY f.instrument_id, f.symbol
    ORDER BY 1, f.symbol;
$$;

-- Activity by client segment
CREATE OR REPLACE VIEW reporting.monthly_segment_activity AS
SELECT month_start, portfolio_size_band, activity_level,
       count(*) AS client_count,
       sum(trade_count) AS trade_count,
       sum(portfolio_value) AS portfolio_value
FROM monthly_client_segments
GROUP BY month_start, portfolio_size_band, activity_level;

-- Monthly exec committee report: one row per month the segment job has run.
--   \copy (SELECT * FROM reporting.monthly_exec_summary ORDER BY month_start) TO 'report.csv' CSV HEADER
CREATE OR REPLACE VIEW reporting.monthly_exec_summary AS
WITH segments AS (
    SELECT month_start,
           count(*) AS clients,
           count(*) FILTER (WHERE portfolio_size_band = 'under_10k') AS clients_under_10k,
           count(*) FILTER (WHERE portfolio_size_band = '10k_100k') AS clients_10k_100k,
           count(*) FILTER (WHERE portfolio_size_band = 'over_100k') AS clients_over_100k,
           count(*) FILTER (WHERE activity_level = 'active') AS active_clients,
           count(*) FILTER (WHERE activity_level = 'occasional') AS occasional_clients,
           count(*) FILTER (WHERE activity_level = 'dormant') AS dormant_clients,
           sum(portfolio_value) AS total_portfolio_value
    FROM monthly_client_segments
    GROUP BY month_start
), trading AS (
    SELECT date_trunc('month', filled_at AT TIME ZONE 'UTC')::date AS month_start,
           count(*) AS trade_count,
           sum(notional) AS traded_notional,
           count(DISTINCT instrument_id) AS instruments_traded
    FROM reporting.fills
    GROUP BY 1
)
SELECT s.month_start, s.clients,
       s.clients_under_10k, s.clients_10k_100k, s.clients_over_100k,
       s.active_clients, s.occasional_clients, s.dormant_clients,
       s.total_portfolio_value,
       coalesce(t.trade_count, 0) AS trade_count,
       coalesce(t.traded_notional, 0) AS traded_notional,
       coalesce(t.instruments_traded, 0) AS instruments_traded
FROM segments s
LEFT JOIN trading t ON t.month_start = s.month_start;

-- ============================================================
-- Append-only enforcement for facts and audit records
-- ============================================================
CREATE OR REPLACE FUNCTION block_admin_analytics_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; updates, deletes and truncates are prohibited', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'trade_records', 'trade_lifecycle_events', 'cash_holding_changes',
        'admin_audit_log', 'monthly_client_segments'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_append_only_%I ON %I', table_name, table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_append_only_%I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION block_admin_analytics_mutation()',
            table_name, table_name
        );
        -- row triggers do not fire on TRUNCATE
        EXECUTE format('DROP TRIGGER IF EXISTS trg_no_truncate_%I ON %I', table_name, table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_no_truncate_%I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION block_admin_analytics_mutation()',
            table_name, table_name
        );
    END LOOP;
END $$;

-- ============================================================
-- Roles: login/membership is managed by deployment
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_etl') THEN
        CREATE ROLE analytics_etl NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_admin') THEN
        CREATE ROLE analytics_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_analyst') THEN
        CREATE ROLE analytics_analyst NOLOGIN;
    END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- Kafka consumer: maintains mirrors, appends facts
GRANT USAGE ON SCHEMA public TO analytics_etl;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_accounts, client_positions,
    instruments TO analytics_etl;
GRANT SELECT, INSERT ON trade_records, trade_lifecycle_events, cash_holding_changes,
    monthly_client_segments TO analytics_etl;

-- Admin: reads everything, can only add audit entries
GRANT USAGE ON SCHEMA public, admin, reporting TO analytics_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA public, admin, reporting TO analytics_admin;
GRANT INSERT ON admin_audit_log TO analytics_admin;

-- Analyst: reporting views only (no client emails, no audit log)
GRANT USAGE ON SCHEMA reporting TO analytics_analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO analytics_analyst;
GRANT EXECUTE ON FUNCTION reporting.instrument_activity(DATE, DATE) TO analytics_analyst, analytics_admin;
