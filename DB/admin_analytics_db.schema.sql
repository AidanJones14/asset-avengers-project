-- Admin and analytics database schema
--
-- Create this database separately, then run this file while connected to it:
--   CREATE DATABASE admin_analytics;
--
-- A Python publisher reads the trading transactional outbox and sends to Kafka;
-- a Python consumer maintains these projections. No Debezium is required.
--
-- Suspensions are enforced in the trading database (accounts.is_suspended,
-- instruments.is_active). The internal API forwards the caller's JWT to the
-- trading API, which commits state and staff_audit_events together. The consumer
-- copies that command audit into admin_audit_log; internal detail-view logs are
-- appended here directly. See DB/README.md for table ownership and relationships.
--
-- Instants are UTC; reporting days/cutoffs use America/New_York.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Avoid the login-name schema (e.g. admin) shadowing the legacy mirror tables.
SET search_path TO public;

CREATE SCHEMA IF NOT EXISTS admin;      -- admin-only views
CREATE SCHEMA IF NOT EXISTS reporting;  -- analyst (and admin) views
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS integration;

-- Mutable status is separate from immutable original terms/lifecycle evidence.
-- This can reflect cancellations even though dedicated cancellation audit is deferred.
CREATE TABLE IF NOT EXISTS audit.order_state (
    order_id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL
);
-- Deduplication and original payload are committed with all derived projections.
-- A duplicate UUID is a no-op, including after a crash before Kafka offset commit.
CREATE TABLE IF NOT EXISTS audit.ingested_events (
    event_id UUID PRIMARY KEY,
    record_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    source_created_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- Preserve the actual observed quote and failed validation reason; never substitute
-- a current provider quote during admin review or export.
CREATE TABLE IF NOT EXISTS audit.pricing_evidence (
    evidence_id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    phase VARCHAR(20) NOT NULL,
    decision VARCHAR(30) NOT NULL,
    reason TEXT,
    quote JSONB,
    observed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pricing_order ON audit.pricing_evidence(order_id,observed_at);
-- Operational freshness, also used to wait for a heartbeat beyond report cutoff.
-- A heartbeat is a local deployment readiness signal, not a rigorous transaction watermark.
CREATE TABLE IF NOT EXISTS integration.pipeline_status (
    pipeline TEXT PRIMARY KEY,
    source_heartbeat_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    last_event_id UUID
);
-- Shared report schedule history. Changes take effect on a future local date so
-- a saved setting cannot reinterpret an already published day's cutoff.
CREATE TABLE IF NOT EXISTS integration.report_schedules (
    schedule_id UUID PRIMARY KEY,
    effective_from DATE NOT NULL,
    cutoff_local_time TIME(0) NOT NULL CHECK (cutoff_local_time >= TIME '00:01'
        AND cutoff_local_time <= TIME '23:59' AND EXTRACT(SECOND FROM cutoff_local_time) = 0),
    changed_by UUID,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_report_schedule_effective
    ON integration.report_schedules(effective_from DESC, changed_at DESC, schedule_id DESC);
INSERT INTO integration.report_schedules(schedule_id,effective_from,cutoff_local_time)
VALUES ('00000000-0000-0000-0000-000000019000','1970-01-01','19:00')
ON CONFLICT (schedule_id) DO NOTHING;

-- Keep each attempt visible even when it fails; the published pointer below can
-- still select an older successful batch while a new attempt is running.
CREATE TABLE IF NOT EXISTS integration.report_batches (
    batch_id UUID PRIMARY KEY,
    report_date DATE NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    cutoff_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running','published','failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    source_heartbeat_at TIMESTAMPTZ,
    error TEXT
);
-- Switch a date's selected version only in the successful report transaction.
CREATE TABLE IF NOT EXISTS integration.published_reports (
    report_date DATE PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES integration.report_batches(batch_id)
);
-- A fill can appear in multiple rebuilt batches, once per batch. Views must join
-- the published pointer so reruns do not inflate dashboard totals.
CREATE TABLE IF NOT EXISTS analytics.trade_facts (
    batch_id UUID NOT NULL REFERENCES integration.report_batches(batch_id),
    fill_id UUID NOT NULL,
    report_date DATE NOT NULL,
    client_id UUID NOT NULL,
    order_id UUID NOT NULL,
    instrument_id UUID NOT NULL,
    symbol TEXT NOT NULL,
    security_type TEXT,
    order_side TEXT NOT NULL,
    quantity NUMERIC(18,4) NOT NULL,
    price NUMERIC(18,4) NOT NULL,
    cash_amount NUMERIC(18,2) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(batch_id,fill_id)
);
-- Superset's prepared dataset uses this publication boundary. The older reporting
-- views below instead aggregate live copied facts without a batch/cutoff contract.
CREATE OR REPLACE VIEW analytics.published_trades AS
SELECT f.* FROM analytics.trade_facts f
JOIN integration.published_reports p USING(batch_id,report_date);
CREATE OR REPLACE VIEW analytics.business_overview AS
SELECT report_date,count(*) AS trade_count,sum(cash_amount) AS traded_notional,
       count(DISTINCT client_id) AS active_clients,count(DISTINCT instrument_id) AS instruments_traded
FROM analytics.published_trades GROUP BY report_date;
CREATE OR REPLACE VIEW analytics.instrument_activity AS
SELECT report_date,instrument_id,symbol,security_type,order_side,count(*) AS trade_count,
       sum(quantity) AS traded_quantity,sum(cash_amount) AS traded_notional,
       count(DISTINCT client_id) AS active_clients
FROM analytics.published_trades GROUP BY report_date,instrument_id,symbol,security_type,order_side;
CREATE OR REPLACE VIEW analytics.client_activity AS
SELECT report_date,client_id,count(*) AS trade_count,sum(cash_amount) AS traded_notional,
       count(DISTINCT instrument_id) AS instruments_traded
FROM analytics.published_trades GROUP BY report_date,client_id;

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
-- Original known order terms, inserted once. Current status lives in audit.order_state;
-- dedicated lifecycle facts cover the local deployment audit scope, not every operational change.
-- For historical imports this row reflects the terms available at snapshot time.
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

-- Recorded submitted/rejected/filled facts plus explicitly labelled snapshot state.
-- Pricing failures append terminal=false attempts; they do not reject the order.
-- Stable event IDs make redelivery safe. Historical imports cannot invent missing steps.
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

ALTER TABLE trade_lifecycle_events ADD COLUMN IF NOT EXISTS terminal BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE trade_lifecycle_events ADD COLUMN IF NOT EXISTS provenance TEXT NOT NULL DEFAULT 'recorded';
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
-- Admin audit log (direct detail-view logs plus replicated source command audits)
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
-- Legacy monthly segmentation proposal; the current 7 PM job does not populate it.
-- ============================================================
-- activity_level: 'active' means traded this month. A future job must define the
-- occasional/dormant policy and supply reliable month-end valuation snapshots.
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

-- Names copied from trading users, whose source is the verified auth identity.
CREATE TABLE IF NOT EXISTS reporting.client_directory (
    client_id UUID PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(255),
    source_updated_at TIMESTAMPTZ NOT NULL
);

-- One row per order with current status and its current client directory name.
CREATE OR REPLACE VIEW admin.trades AS
SELECT tr.order_id, tr.client_id, tr.account_id, tr.symbol, tr.order_side,
       tr.order_type, tr.quantity, tr.limit_price, tr.stop_price,
       coalesce(s.status, CASE WHEN e.filled_at IS NOT NULL THEN 'filled'
            WHEN e.rejected_at IS NOT NULL THEN 'rejected'
            WHEN e.cancelled_at IS NOT NULL THEN 'cancelled'
            WHEN e.submitted_at IS NOT NULL THEN 'submitted'
            ELSE 'accepted' END) AS status,
       tr.placed_at, e.accepted_at, e.submitted_at,
       e.filled_at, e.fill_price, e.rejected_at, e.rejection_reason, e.cancelled_at,
       m.cash_change, m.holding_change,
       coalesce(nullif(trim(d.full_name),''),'Unknown client') AS client_name
FROM trade_records tr
LEFT JOIN audit.order_state s ON s.order_id=tr.order_id
LEFT JOIN LATERAL (
    SELECT max(event_at) FILTER (WHERE event_type = 'accepted') AS accepted_at,
           max(event_at) FILTER (WHERE event_type = 'submitted') AS submitted_at,
           max(event_at) FILTER (WHERE event_type = 'filled') AS filled_at,
           max(price) FILTER (WHERE event_type = 'filled') AS fill_price,
           max(event_at) FILTER (WHERE event_type = 'rejected' AND terminal) AS rejected_at,
           max(rejection_reason) FILTER (WHERE event_type = 'rejected' AND terminal) AS rejection_reason,
           max(event_at) FILTER (WHERE event_type = 'cancelled') AS cancelled_at
    FROM trade_lifecycle_events
    WHERE order_id = tr.order_id
) e ON TRUE
LEFT JOIN LATERAL (
    SELECT sum(cash_delta) AS cash_change, sum(holding_delta) AS holding_change
    FROM cash_holding_changes
    WHERE order_id = tr.order_id
) m ON TRUE
LEFT JOIN reporting.client_directory d ON d.client_id=tr.client_id;

-- Recorded lifecycle and movements; query ORDER BY occurred_at when consuming.
-- The evidence API reads original terminal/provenance fields directly instead.
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
-- Compatibility reporting views: copied facts, not the scheduled published batch.
-- ============================================================
CREATE OR REPLACE VIEW reporting.fills AS
SELECT e.order_id, tr.client_id, tr.instrument_id, tr.symbol, tr.order_side,
       e.quantity, e.price, abs(c.cash_delta) AS notional,
       e.event_at AS filled_at
FROM trade_lifecycle_events e
JOIN trade_records tr ON tr.order_id = e.order_id
JOIN cash_holding_changes c ON c.order_id=e.order_id AND c.change_type='trade'
WHERE e.event_type = 'filled';

-- Trading volumes over time
CREATE OR REPLACE VIEW reporting.daily_trading_volume AS
SELECT (filled_at AT TIME ZONE 'America/New_York')::date AS trade_date,
       count(*) AS trade_count,
       sum(quantity) AS traded_quantity,
       sum(notional) AS traded_notional,
       count(DISTINCT client_id) AS active_clients,
       count(DISTINCT instrument_id) AS instruments_traded
FROM reporting.fills
GROUP BY 1;

CREATE OR REPLACE VIEW reporting.daily_instrument_activity AS
SELECT (filled_at AT TIME ZONE 'America/New_York')::date AS trade_date,
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
    WHERE f.filled_at >= p_from::timestamp AT TIME ZONE 'America/New_York'
      AND f.filled_at < (p_to + 1)::timestamp AT TIME ZONE 'America/New_York'
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
    SELECT date_trunc('month', filled_at AT TIME ZONE 'America/New_York')::date AS month_start,
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

-- Retain existing public mirror tables/admin views for API compatibility. New
-- provenance, evidence, batch tracking and prepared datasets have dedicated schemas.
GRANT USAGE ON SCHEMA audit,integration,analytics TO analytics_etl,analytics_admin;
GRANT SELECT,INSERT ON audit.ingested_events,audit.pricing_evidence TO analytics_etl;
GRANT SELECT,INSERT,UPDATE ON audit.order_state,integration.pipeline_status,
    integration.report_batches,integration.published_reports TO analytics_etl;
GRANT SELECT,INSERT ON analytics.trade_facts,admin_audit_log TO analytics_etl;
GRANT SELECT ON ALL TABLES IN SCHEMA audit,integration,analytics TO analytics_admin;
GRANT USAGE ON SCHEMA analytics TO analytics_analyst;
GRANT SELECT ON analytics.published_trades,analytics.business_overview,
    analytics.instrument_activity,analytics.client_activity TO analytics_analyst;
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['audit.ingested_events','audit.pricing_evidence','analytics.trade_facts'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_immutable ON %s',t);
        EXECUTE format('CREATE TRIGGER trg_immutable BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION block_admin_analytics_mutation()',t);
        EXECUTE format('DROP TRIGGER IF EXISTS trg_no_truncate ON %s',t);
        EXECUTE format('CREATE TRIGGER trg_no_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION block_admin_analytics_mutation()',t);
    END LOOP;
END $$;

-- Superset bootstrap writes IDs for approved dashboard keys. The API reads this
-- mapping; a browser cannot request an arbitrary Superset dashboard ID.
CREATE TABLE IF NOT EXISTS integration.dashboard_registry (
    dashboard_key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    embedded_id UUID NOT NULL
);
GRANT SELECT ON integration.dashboard_registry TO analytics_admin;
-- The worker can read projection views for reconciliation, but cannot change them.
GRANT USAGE ON SCHEMA admin TO analytics_etl;
GRANT SELECT ON ALL TABLES IN SCHEMA admin TO analytics_etl;
GRANT SELECT ON analytics.published_trades,analytics.business_overview,
    analytics.instrument_activity,analytics.client_activity TO analytics_etl;

-- Staff may append report preferences, not mutate trade facts or schedule history.
GRANT SELECT,INSERT ON integration.report_schedules TO analytics_admin;
GRANT SELECT ON integration.report_schedules TO analytics_etl;
DROP TRIGGER IF EXISTS trg_report_schedule_immutable ON integration.report_schedules;
CREATE TRIGGER trg_report_schedule_immutable BEFORE UPDATE OR DELETE ON integration.report_schedules
FOR EACH ROW EXECUTE FUNCTION block_admin_analytics_mutation();
DROP TRIGGER IF EXISTS trg_report_schedule_no_truncate ON integration.report_schedules;
CREATE TRIGGER trg_report_schedule_no_truncate BEFORE TRUNCATE ON integration.report_schedules
FOR EACH STATEMENT EXECUTE FUNCTION block_admin_analytics_mutation();

-- Staff enqueue report work; only the reporting worker publishes financial facts.
CREATE TABLE IF NOT EXISTS integration.report_requests (
    request_id UUID PRIMARY KEY,
    requested_by UUID NOT NULL,
    cutoff_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','published','failed')),
    batch_id UUID REFERENCES integration.report_batches(batch_id),
    completed_at TIMESTAMPTZ,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_report_requests_queue ON integration.report_requests(cutoff_at)
    WHERE status='queued';
GRANT SELECT,INSERT ON integration.report_requests TO analytics_admin;
GRANT SELECT,UPDATE ON integration.report_requests TO analytics_etl;

GRANT SELECT ON reporting.client_directory TO analytics_admin,analytics_analyst;
GRANT USAGE ON SCHEMA reporting TO analytics_etl;
GRANT SELECT,INSERT,UPDATE ON reporting.client_directory TO analytics_etl;

-- Current identity labels enrich published facts without changing their financial cutoff.
-- IDs remain separate so people with the same name are never treated as one client.
CREATE OR REPLACE VIEW analytics.named_published_trades AS
SELECT p.*, coalesce(nullif(trim(d.full_name),''),'Unknown client') AS client_name,
       coalesce(nullif(trim(d.full_name),''),'Unknown client') || ' (' || p.client_id::text || ')' AS client_label
FROM analytics.published_trades p LEFT JOIN reporting.client_directory d USING(client_id);
GRANT SELECT ON analytics.named_published_trades TO analytics_analyst,analytics_admin,analytics_etl;
