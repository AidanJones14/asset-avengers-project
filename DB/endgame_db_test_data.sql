-- Asset Avengers trading platform corrected test data
-- Only clients can have accounts (no accounts for admins/analysts)
-- ISIN values fixed to 12 chars max
-- All foreign key dependencies properly ordered

-- ============================================================
-- AUTH.USERS (8 entries - must be created first)
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000001'::UUID, 'alice.admin@example.com', 'hashed_password', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000002'::UUID, 'bob.admin@example.com', 'hashed_password', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000003'::UUID, 'charlie.analyst@example.com', 'hashed_password', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000004'::UUID, 'diana.analyst@example.com', 'hashed_password', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000005'::UUID, 'eve.analyst@example.com', 'hashed_password', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000006'::UUID, 'frank.client@example.com', 'hashed_password', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000007'::UUID, 'grace.client@example.com', 'hashed_password', now(), now(), now()),
    ('00000000-0000-0000-0000-000000000008'::UUID, 'henry.client@example.com', 'hashed_password', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- USERS (8 entries: 2 admins, 3 analysts, 3 clients)
-- ============================================================
INSERT INTO users (user_id, name, role) VALUES
    ('00000000-0000-0000-0000-000000000001'::UUID, 'Alice Admin', 'admin'),
    ('00000000-0000-0000-0000-000000000002'::UUID, 'Bob Admin', 'admin'),
    ('00000000-0000-0000-0000-000000000003'::UUID, 'Charlie Analyst', 'analyst'),
    ('00000000-0000-0000-0000-000000000004'::UUID, 'Diana Analyst', 'analyst'),
    ('00000000-0000-0000-0000-000000000005'::UUID, 'Eve Analyst', 'analyst'),
    ('00000000-0000-0000-0000-000000000006'::UUID, 'Frank Client', 'client'),
    ('00000000-0000-0000-0000-000000000007'::UUID, 'Grace Client', 'client'),
    ('00000000-0000-0000-0000-000000000008'::UUID, 'Henry Client', 'client')
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- INSTRUMENTS (10 entries - fixed ISIN to max 12 chars)
-- ============================================================
INSERT INTO instruments (instrument_id, symbol, name, security_type, exchange, currency, isin, is_active) VALUES
    ('10000000-0000-0000-0000-000000000001'::UUID, 'AAPL', 'Apple Inc.', 'equity', 'NASDAQ', 'USD', 'US037833100', true),
    ('10000000-0000-0000-0000-000000000002'::UUID, 'GOOGL', 'Alphabet Inc.', 'equity', 'NASDAQ', 'USD', 'US0207930590', true),
    ('10000000-0000-0000-0000-000000000003'::UUID, 'MSFT', 'Microsoft Corporation', 'equity', 'NASDAQ', 'USD', 'US594918104', true),
    ('10000000-0000-0000-0000-000000000004'::UUID, 'AMZN', 'Amazon.com Inc.', 'equity', 'NASDAQ', 'USD', 'US023135102', true),
    ('10000000-0000-0000-0000-000000000005'::UUID, 'TSLA', 'Tesla Inc.', 'equity', 'NASDAQ', 'USD', 'US881601101', true),
    ('10000000-0000-0000-0000-000000000006'::UUID, 'JPM', 'JPMorgan Chase', 'equity', 'NYSE', 'USD', 'US466253100', true),
    ('10000000-0000-0000-0000-000000000011'::UUID, 'XLE', 'Energy Select Sector SPDR', 'etf', 'NASDAQ', 'USD', 'US784621030', true),
    ('10000000-0000-0000-0000-000000000012'::UUID, 'QQQ', 'Invesco QQQ Trust', 'etf', 'NASDAQ', 'USD', 'US784621003', true),
    ('10000000-0000-0000-0000-000000000013'::UUID, 'SPY', 'SPDR S&P 500 ETF', 'etf', 'NASDAQ', 'USD', 'US784621010', true),
    ('10000000-0000-0000-0000-000000000014'::UUID, 'IWM', 'iShares Russell 2000', 'etf', 'NASDAQ', 'USD', 'US464351015', true)
ON CONFLICT (instrument_id) DO NOTHING;

-- ============================================================
-- ACCOUNTS (ONLY for clients: 3 accounts)
-- ============================================================
INSERT INTO accounts (account_id, user_id, cash_balance, is_suspended) VALUES
    ('20000000-0000-0000-0000-000000000001'::UUID, '00000000-0000-0000-0000-000000000006'::UUID, 50000.00, false),
    ('20000000-0000-0000-0000-000000000002'::UUID, '00000000-0000-0000-0000-000000000007'::UUID, 75000.00, false),
    ('20000000-0000-0000-0000-000000000003'::UUID, '00000000-0000-0000-0000-000000000008'::UUID, 100000.00, false)
ON CONFLICT (account_id) DO NOTHING;

-- ============================================================
-- ORDERS (5 sample orders)
-- ============================================================
INSERT INTO orders (order_id, account_id, instrument_id, quantity, order_side, order_type, limit_price, price, status, order_date) VALUES
    ('30000000-0000-0000-0000-000000000001'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, 10, 'buy', 'market', NULL, 150.25, 'filled', now()),
    ('30000000-0000-0000-0000-000000000002'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000002'::UUID, 5, 'buy', 'limit', 140.00, 139.99, 'filled', now()),
    ('30000000-0000-0000-0000-000000000003'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000003'::UUID, 8, 'buy', 'market', NULL, 380.50, 'filled', now()),
    ('30000000-0000-0000-0000-000000000004'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, 2, 'sell', 'market', NULL, 151.00, 'filled', now()),
    ('30000000-0000-0000-0000-000000000005'::UUID, '20000000-0000-0000-0000-000000000003'::UUID, '10000000-0000-0000-0000-000000000004'::UUID, 15, 'buy', 'limit', 175.00, NULL, 'submitted', now())
ON CONFLICT (order_id) DO NOTHING;

-- ============================================================
-- HOLDINGS (current positions)
-- ============================================================
INSERT INTO holdings (holding_id, account_id, instrument_id, quantity) VALUES
    ('40000000-0000-0000-0000-000000000001'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, 10.0),
    ('40000000-0000-0000-0000-000000000002'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000002'::UUID, 5.0),
    ('40000000-0000-0000-0000-000000000003'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000003'::UUID, 8.0),
    ('40000000-0000-0000-0000-000000000004'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, 0.0),
    ('40000000-0000-0000-0000-000000000005'::UUID, '20000000-0000-0000-0000-000000000003'::UUID, '10000000-0000-0000-0000-000000000005'::UUID, 3.5)
ON CONFLICT (account_id, instrument_id) DO NOTHING;

-- ============================================================
-- TRANSACTIONS (5 sample transactions)
-- ============================================================
INSERT INTO transactions (transaction_id, account_id, txn_type, amount, created_at) VALUES
    ('50000000-0000-0000-0000-000000000001'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, 'deposit', 50000.00, now()),
    ('50000000-0000-0000-0000-000000000002'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, 'deposit', 75000.00, now()),
    ('50000000-0000-0000-0000-000000000003'::UUID, '20000000-0000-0000-0000-000000000003'::UUID, 'deposit', 100000.00, now()),
    ('50000000-0000-0000-0000-000000000004'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, 'dividend', 150.00, now()),
    ('50000000-0000-0000-0000-000000000005'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, 'dividend', 200.00, now())
ON CONFLICT (transaction_id) DO NOTHING;
