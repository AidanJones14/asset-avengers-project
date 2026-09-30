-- Analytics Database Setup
-- Run this on the ANALYTICS PostgreSQL database
-- Creates users, schema, and all reporting tables

-- ============================================================
-- Create Metabase read-only user
-- ============================================================
CREATE USER metabase_user WITH PASSWORD 'secure_metabase_password_change_me';

-- ============================================================
-- Create Analytics Schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO metabase_user;

-- ============================================================
-- DIMENSION TABLES
-- ============================================================

-- Clients Dimension Table
-- Copied from production users table (only clients)
CREATE TABLE IF NOT EXISTS analytics.clients (
    client_id           UUID PRIMARY KEY,
    client_name         VARCHAR(255) NOT NULL,
    client_email        VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sync_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_clients_name ON analytics.clients (client_name);

-- Instruments Dimension Table
-- Copied from production instruments table
CREATE TABLE IF NOT EXISTS analytics.instruments (
    instrument_id       UUID PRIMARY KEY,
    symbol              VARCHAR(20) NOT NULL UNIQUE,
    instrument_name     VARCHAR(255) NOT NULL,
    security_type       VARCHAR(30) NOT NULL,
    exchange            VARCHAR(50),
    currency            VARCHAR(10),
    isin                VARCHAR(12),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_instruments_symbol ON analytics.instruments (symbol);
CREATE INDEX IF NOT EXISTS idx_analytics_instruments_type ON analytics.instruments (security_type);

-- ============================================================
-- FACT TABLE
-- ============================================================

-- Trades Fact Table
-- Denormalized view of orders with client and instrument details
-- Optimized for analysis: includes all dimensions needed for reporting
CREATE TABLE IF NOT EXISTS analytics.trades_fact (
    trade_id                UUID PRIMARY KEY,
    -- Foreign Keys to dimensions
    client_id               UUID NOT NULL REFERENCES analytics.clients (client_id),
    instrument_id           UUID NOT NULL REFERENCES analytics.instruments (instrument_id),
    -- Trade Details
    quantity                NUMERIC(18, 4) NOT NULL,
    order_side              VARCHAR(10) NOT NULL,  -- 'buy' or 'sell'
    order_type              VARCHAR(20) NOT NULL,  -- 'market', 'limit', 'stop', 'stop_limit'
    execution_price         NUMERIC(18, 4),        -- NULL if not filled
    trade_date              DATE NOT NULL,         -- For time-based analysis
    trade_timestamp         TIMESTAMPTZ NOT NULL,  -- Full timestamp
    status                  VARCHAR(20) NOT NULL,  -- 'submitted', 'accepted', 'filled', 'cancelled', 'rejected'
    -- Denormalized data (for query performance)
    client_name             VARCHAR(255) NOT NULL,
    symbol                  VARCHAR(20) NOT NULL,
    security_type           VARCHAR(30) NOT NULL,
    -- Audit columns
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sync_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_client_id ON analytics.trades_fact (client_id);
CREATE INDEX IF NOT EXISTS idx_trades_instrument_id ON analytics.trades_fact (instrument_id);
CREATE INDEX IF NOT EXISTS idx_trades_trade_date ON analytics.trades_fact (trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON analytics.trades_fact (status);
CREATE INDEX IF NOT EXISTS idx_trades_order_side ON analytics.trades_fact (order_side);
CREATE INDEX IF NOT EXISTS idx_trades_client_date ON analytics.trades_fact (client_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol_date ON analytics.trades_fact (symbol, trade_date DESC);

-- ============================================================
-- ETL SYNC STATE TRACKING
-- ============================================================

-- Track last successful sync per table/entity
-- Prevents re-syncing and enables incremental updates
CREATE TABLE IF NOT EXISTS analytics.etl_sync_state (
    table_name          VARCHAR(255) PRIMARY KEY,
    last_synced_at      TIMESTAMPTZ,
    last_order_id       UUID,  -- Last order_id successfully synced
    sync_status         VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'in_progress', 'success', 'failed'
    error_message       TEXT,
    attempted_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert initial sync state records
INSERT INTO analytics.etl_sync_state (table_name, sync_status) 
VALUES 
    ('clients', 'pending'),
    ('instruments', 'pending'),
    ('trades', 'pending')
ON CONFLICT (table_name) DO NOTHING;

-- ============================================================
-- PERMISSIONS
-- ============================================================

-- Grant SELECT on all analytics schema objects to Metabase user
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO metabase_user;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA analytics TO metabase_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO metabase_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON SEQUENCES TO metabase_user;

-- Ensure metabase_user cannot write/modify
ALTER USER metabase_user WITH NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

-- For the ETL process, we need a dedicated ETL user on analytics database
-- This user will have INSERT/UPDATE/DELETE on analytics tables
CREATE USER analytics_etl_user WITH PASSWORD 'secure_analytics_etl_password_change_me';
GRANT USAGE ON SCHEMA analytics TO analytics_etl_user;
GRANT ALL ON ALL TABLES IN SCHEMA analytics TO analytics_etl_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analytics TO analytics_etl_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT ALL ON TABLES TO analytics_etl_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT ALL ON SEQUENCES TO analytics_etl_user;
ALTER USER analytics_etl_user WITH NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

-- ============================================================
-- MATERIALIZED VIEWS FOR REPORTING
-- ============================================================

-- Monthly Trading Volume by Client
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_monthly_volume AS
SELECT 
    DATE_TRUNC('month', t.trade_date)::DATE as month,
    t.client_name,
    t.client_id,
    COUNT(*) as total_trades,
    SUM(CASE WHEN t.order_side = 'buy' THEN t.quantity ELSE 0 END) as total_buy_quantity,
    SUM(CASE WHEN t.order_side = 'sell' THEN t.quantity ELSE 0 END) as total_sell_quantity,
    SUM(CASE WHEN t.status = 'filled' AND t.execution_price IS NOT NULL 
             THEN t.quantity * t.execution_price ELSE 0 END) as total_value
FROM analytics.trades_fact t
WHERE t.status IN ('filled', 'accepted')
GROUP BY DATE_TRUNC('month', t.trade_date), t.client_name, t.client_id
ORDER BY month DESC, total_trades DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_volume 
ON analytics.mv_monthly_volume (month, client_id);

-- Client Activity Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_client_activity AS
SELECT 
    t.client_id,
    t.client_name,
    COUNT(DISTINCT DATE(t.trade_date)) as active_days,
    COUNT(DISTINCT t.symbol) as unique_instruments_traded,
    COUNT(*) as total_trades,
    MAX(t.trade_date) as last_trade_date,
    MIN(t.trade_date) as first_trade_date,
    COUNT(DISTINCT DATE_TRUNC('month', t.trade_date)::DATE) as active_months
FROM analytics.trades_fact t
WHERE t.status IN ('filled', 'accepted')
GROUP BY t.client_id, t.client_name
ORDER BY total_trades DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_client_activity 
ON analytics.mv_client_activity (client_id);

-- Trading Volume by Client Name
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_trades_by_client_name AS
SELECT 
    t.client_name,
    t.client_id,
    COUNT(*) as total_trades,
    COUNT(*) FILTER (WHERE t.order_side = 'buy') as buy_trades,
    COUNT(*) FILTER (WHERE t.order_side = 'sell') as sell_trades,
    SUM(t.quantity) as total_quantity,
    SUM(CASE WHEN t.status = 'filled' AND t.execution_price IS NOT NULL 
             THEN t.quantity * t.execution_price ELSE 0 END) as total_notional_value,
    COUNT(*) FILTER (WHERE t.status = 'filled') as filled_trades,
    COUNT(*) FILTER (WHERE t.status = 'cancelled') as cancelled_trades
FROM analytics.trades_fact t
GROUP BY t.client_name, t.client_id
ORDER BY total_trades DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trades_by_client_name 
ON analytics.mv_trades_by_client_name (client_id);

-- Active Clients
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_active_clients AS
SELECT 
    t.client_id,
    t.client_name,
    DATE_TRUNC('day', MAX(t.trade_date))::DATE as last_activity,
    COUNT(*) as lifetime_trades,
    COUNT(DISTINCT DATE_TRUNC('month', t.trade_date)::DATE) as months_active,
    COUNT(DISTINCT t.symbol) as instruments_count
FROM analytics.trades_fact t
WHERE t.status IN ('filled', 'accepted')
GROUP BY t.client_id, t.client_name
HAVING MAX(t.trade_date) >= NOW() - INTERVAL '90 days'
ORDER BY MAX(t.trade_date) DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_active_clients 
ON analytics.mv_active_clients (client_id);

-- Trade Summary Statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_trade_summary AS
SELECT 
    1 as summary_id,  -- Dummy unique column for concurrent refresh
    COUNT(*) as total_trades,
    COUNT(DISTINCT t.client_id) as total_clients,
    COUNT(DISTINCT t.symbol) as total_instruments,
    COUNT(*) FILTER (WHERE t.order_side = 'buy') as total_buy_trades,
    COUNT(*) FILTER (WHERE t.order_side = 'sell') as total_sell_trades,
    COUNT(*) FILTER (WHERE t.status = 'filled') as filled_trades,
    COUNT(*) FILTER (WHERE t.status = 'rejected') as rejected_trades,
    AVG(t.quantity) FILTER (WHERE t.status = 'filled') as avg_trade_size,
    SUM(CASE WHEN t.status = 'filled' AND t.execution_price IS NOT NULL 
             THEN t.quantity * t.execution_price ELSE 0 END) as total_notional_value
FROM analytics.trades_fact t;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trade_summary 
ON analytics.mv_trade_summary (summary_id);

-- ============================================================
-- REFRESH FUNCTION (for manual refresh of materialized views)
-- ============================================================

CREATE OR REPLACE FUNCTION analytics.refresh_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_monthly_volume;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_client_activity;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_trades_by_client_name;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_active_clients;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_trade_summary;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION analytics.refresh_materialized_views() TO analytics_etl_user;
