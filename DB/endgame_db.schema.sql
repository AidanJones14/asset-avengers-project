-- Asset Avengers trading platform schema
-- Dialect: PostgreSQL 13+ (Supabase). Safe to run multiple times (idempotent):
-- uses IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS throughout.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- generic helper to keep updated_at columns current on any row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- users
-- ============================================================
-- One row per person who has used the trading API. Rows are created by Spring
-- (CurrentUserService.getOrCreate) on a user's first authenticated request.
-- user_id is the auth service's user id (the JWT's sub). That service has its own
-- database, so there is no foreign key to it.
CREATE TABLE IF NOT EXISTS users (
    user_id     UUID PRIMARY KEY,
    email       VARCHAR(255) UNIQUE,  -- copied from the JWT; used by admin search
    name        VARCHAR(255),         -- the JWT carries no name
    role        VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'analyst', 'client')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bring databases created from the older version of this table up to date.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_id_fkey;
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ============================================================
-- accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    account_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
    cash_balance    NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (cash_balance >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_suspended     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts (user_id);

-- analysts andadmins are staff, not traders, and must never hold a trading account
CREATE OR REPLACE FUNCTION prevent_staff_account()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE user_id = NEW.user_id AND role IN ('admin', 'analyst')) THEN
        RAISE EXCEPTION 'staff cannot have trading accounts (user_id: %)', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_staff_account ON accounts;
CREATE TRIGGER trg_prevent_staff_account
    BEFORE INSERT OR UPDATE OF user_id ON accounts
    FOR EACH ROW EXECUTE FUNCTION prevent_staff_account();

-- block promoting a user to staff while they already own an account
CREATE OR REPLACE FUNCTION prevent_staff_role_with_account()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IN ('admin', 'analyst') AND EXISTS (SELECT 1 FROM accounts WHERE user_id = NEW.user_id) THEN
        RAISE EXCEPTION 'cannot set role to staff: user_id % already has a trading account', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_staff_role_with_account ON users;
CREATE TRIGGER trg_prevent_staff_role_with_account
    BEFORE INSERT OR UPDATE OF role ON users
    FOR EACH ROW EXECUTE FUNCTION prevent_staff_role_with_account();

-- ============================================================
-- bank_accounts (user's linked bank accounts for deposits/withdrawals)
-- ============================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    bank_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    bank_name       VARCHAR(255) NOT NULL,
    routing_number  VARCHAR(20) NOT NULL,
    account_number  VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts (user_id);

-- ============================================================
-- instruments (populated from a permitted-instruments list)
-- ============================================================
CREATE TABLE IF NOT EXISTS instruments (
    instrument_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol          VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    security_type   VARCHAR(30) NOT NULL CHECK (security_type IN ('equity', 'etf', 'bond', 'option', 'future', 'crypto', 'mutual_fund')),
    exchange        VARCHAR(50),
    currency        VARCHAR(10) NOT NULL DEFAULT 'USD',
    isin            VARCHAR(12) CHECK (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$') UNIQUE, -- International Securities Identification Number
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_instruments_security_type ON instruments (security_type);
CREATE INDEX IF NOT EXISTS idx_instruments_is_active ON instruments (is_active);

-- ============================================================
-- watchlists
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlists (
    watchlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists (user_id);

DROP TRIGGER IF EXISTS trg_watchlists_set_updated_at ON watchlists;
CREATE TRIGGER trg_watchlists_set_updated_at
    BEFORE UPDATE ON watchlists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- watchlist_items
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist_items (
    watchlist_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID NOT NULL REFERENCES watchlists (watchlist_id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments (instrument_id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (watchlist_id, instrument_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON watchlist_items (watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_instrument_id ON watchlist_items (instrument_id);

-- ============================================================
-- orders (buy/sell only; execution price comes from a middle-tier API)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    order_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts (account_id) ON DELETE RESTRICT,
    instrument_id   UUID NOT NULL REFERENCES instruments (instrument_id) ON DELETE RESTRICT,
    quantity        NUMERIC(18, 4) NOT NULL CHECK (quantity > 0), -- allow fractional quantities
    order_side      VARCHAR(10) NOT NULL CHECK (order_side IN ('buy', 'sell')),
    order_type      VARCHAR(20) NOT NULL CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit')),
    limit_price     NUMERIC(18, 4) CHECK (limit_price > 0),
    stop_price      NUMERIC(18, 4) CHECK (stop_price > 0),
    price           NUMERIC(18, 4) CHECK (price > 0), -- execution price, filled in by middle-tier once order fills
    reserved_cash   NUMERIC(38, 2) CHECK (reserved_cash >= 0), -- estimated commitment while submitted
    stop_triggered  BOOLEAN NOT NULL DEFAULT FALSE,
    status          VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'accepted', 'filled', 'cancelled', 'rejected')),
    rejection_reason  VARCHAR(255) CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL), -- reason for order rejection, if applicable
    date_placed      TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_finalized      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (order_type NOT IN ('limit', 'stop_limit') OR limit_price IS NOT NULL),
    CHECK (order_type NOT IN ('stop', 'stop_limit') OR stop_price IS NOT NULL),
    CHECK (status <> 'filled' OR price IS NOT NULL)
);

-- Upgrade existing orders without modifying their execution prices or statuses.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserved_cash NUMERIC(38, 2) CHECK (reserved_cash >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stop_triggered BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('submitted', 'accepted', 'filled', 'cancelled', 'rejected'));
ALTER TABLE orders ALTER COLUMN date_finalized DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN date_finalized DROP DEFAULT;
UPDATE orders SET reserved_cash = ceil(quantity * limit_price * 100) / 100
    WHERE reserved_cash IS NULL AND status IN ('submitted', 'accepted') AND order_side = 'buy'
      AND order_type IN ('limit', 'stop_limit');
-- Legacy market/stop buys remain unpriced. Cancel and resubmit them with a fresh
-- quote; validation blocks further buys until their commitments are known.

CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders (account_id);
CREATE INDEX IF NOT EXISTS idx_orders_instrument_id ON orders (instrument_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (date_placed);
CREATE INDEX IF NOT EXISTS idx_orders_account_id_order_date ON orders (account_id, date_placed DESC);

DROP TRIGGER IF EXISTS trg_orders_set_updated_at ON orders;
CREATE TRIGGER trg_orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- trigger to update the account's updated_at timestamp whenever a new order is inserted
CREATE OR REPLACE FUNCTION touch_account_on_order()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE accounts SET updated_at = now() WHERE account_id = NEW.account_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
DROP TRIGGER IF EXISTS trg_touch_account_on_order ON orders;
CREATE TRIGGER trg_touch_account_on_order
    AFTER INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION touch_account_on_order();

-- ============================================================
-- transactions (cash/instrument events not tied to a buy/sell order)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts (account_id) ON DELETE RESTRICT,
    instrument_id   UUID REFERENCES instruments (instrument_id) ON DELETE RESTRICT,
    txn_type        VARCHAR(20) NOT NULL CHECK (txn_type IN ('deposit', 'withdrawal', 'dividend')),
    amount          NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- only dividends are tied to an instrument; deposits/withdrawals are pure cash movements
    CHECK ((txn_type = 'dividend' AND instrument_id IS NOT NULL) OR (txn_type <> 'dividend' AND instrument_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_txn_type ON transactions (txn_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_instrument_id ON transactions (instrument_id) WHERE instrument_id IS NOT NULL;

-- transactions are part of the permanent record (BR-14): no edits, ever
CREATE OR REPLACE FUNCTION block_transaction_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'transactions are append-only and cannot be updated or deleted (transaction_id: %)',
        OLD.transaction_id;
END;
$$ LANGUAGE plpgsql;
 
DROP TRIGGER IF EXISTS trg_block_transaction_update ON transactions;
CREATE TRIGGER trg_block_transaction_update
    BEFORE UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION block_transaction_mutation();
 
-- stamp the owning account's updated_at the moment a transaction is placed
CREATE OR REPLACE FUNCTION touch_account_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE accounts SET updated_at = now() WHERE account_id = NEW.account_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
DROP TRIGGER IF EXISTS trg_touch_account_on_transaction ON transactions;
CREATE TRIGGER trg_touch_account_on_transaction
    AFTER INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION touch_account_on_transaction();

-- ============================================================
-- holdings (current position per account/instrument)
-- ============================================================
CREATE TABLE IF NOT EXISTS holdings (
    holding_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts (account_id) ON DELETE RESTRICT,
    instrument_id   UUID NOT NULL REFERENCES instruments (instrument_id) ON DELETE RESTRICT,
    quantity        NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, instrument_id)
);

CREATE INDEX IF NOT EXISTS idx_holdings_instrument_id ON holdings (instrument_id);

DROP TRIGGER IF EXISTS trg_holdings_set_updated_at ON holdings;
CREATE TRIGGER trg_holdings_set_updated_at
    BEFORE UPDATE ON holdings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Permanent execution record; one full fill per order in the quote-based simulator.
CREATE TABLE IF NOT EXISTS trade_fills (
    fill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders (order_id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES accounts (account_id) ON DELETE RESTRICT,
    instrument_id UUID NOT NULL REFERENCES instruments (instrument_id) ON DELETE RESTRICT,
    order_side VARCHAR(10) NOT NULL CHECK (order_side IN ('buy', 'sell')),
    quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
    price NUMERIC(18, 4) NOT NULL CHECK (price > 0),
    cash_amount NUMERIC(18, 2) NOT NULL CHECK (cash_amount > 0),
    executed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trade_fills_account_time ON trade_fills (account_id, executed_at DESC);

CREATE OR REPLACE FUNCTION block_trade_fill_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'trade fills are append-only (fill_id: %)', OLD.fill_id;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_block_trade_fill_mutation ON trade_fills;
CREATE TRIGGER trg_block_trade_fill_mutation
    BEFORE UPDATE OR DELETE ON trade_fills
    FOR EACH ROW EXECUTE FUNCTION block_trade_fill_mutation();
