-- Asset Avengers trading platform corrected test data
-- Only clients can have accounts (no accounts for admins/analysts)
-- ISIN values fixed to 12 chars max
-- All foreign key dependencies properly ordered
-- Auth tables are now in the separate auth_db database

-- ============================================================
-- USERS (3 clients only)
-- ============================================================
INSERT INTO users (user_id, name, role) VALUES
    ('00000000-0000-0000-0000-000000000006'::UUID, 'Frank Client', 'client'),
    ('00000000-0000-0000-0000-000000000007'::UUID, 'Grace Client', 'client'),
    ('00000000-0000-0000-0000-000000000008'::UUID, 'Henry Client', 'client')
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- INSTRUMENTS (10 entries - fixed ISIN to exactly 12 chars)
-- ============================================================
INSERT INTO instruments (instrument_id, symbol, name, security_type, exchange, currency, isin, is_active) VALUES
    ('10000000-0000-0000-0000-000000000001'::UUID, 'AAPL', 'Apple Inc.', 'equity', 'NASDAQ', 'USD', 'US0378331004', true),
    ('10000000-0000-0000-0000-000000000002'::UUID, 'GOOGL', 'Alphabet Inc.', 'equity', 'NASDAQ', 'USD', 'US0207930590', true),
    ('10000000-0000-0000-0000-000000000003'::UUID, 'MSFT', 'Microsoft Corporation', 'equity', 'NASDAQ', 'USD', 'US5949181040', true),
    ('10000000-0000-0000-0000-000000000004'::UUID, 'AMZN', 'Amazon.com Inc.', 'equity', 'NASDAQ', 'USD', 'US0231351023', true),
    ('10000000-0000-0000-0000-000000000005'::UUID, 'TSLA', 'Tesla Inc.', 'equity', 'NASDAQ', 'USD', 'US8816011012', true),
    ('10000000-0000-0000-0000-000000000006'::UUID, 'JPM', 'JPMorgan Chase', 'equity', 'NYSE', 'USD', 'US4662531003', true),
    ('10000000-0000-0000-0000-000000000011'::UUID, 'XLE', 'Energy Select Sector SPDR', 'etf', 'NASDAQ', 'USD', 'US7846210302', true),
    ('10000000-0000-0000-0000-000000000012'::UUID, 'QQQ', 'Invesco QQQ Trust', 'etf', 'NASDAQ', 'USD', 'US7846210037', true),
    ('10000000-0000-0000-0000-000000000013'::UUID, 'SPY', 'SPDR S&P 500 ETF', 'etf', 'NASDAQ', 'USD', 'US7846211041', true),
    ('10000000-0000-0000-0000-000000000014'::UUID, 'IWM', 'iShares Russell 2000', 'etf', 'NASDAQ', 'USD', 'US4643510156', true)
ON CONFLICT (instrument_id) DO NOTHING;

-- ============================================================
-- ACCOUNTS (ONLY for clients: 3 accounts with $0 initial balance)
-- ============================================================
INSERT INTO accounts (account_id, user_id, cash_balance, is_suspended) VALUES
    ('20000000-0000-0000-0000-000000000001'::UUID, '00000000-0000-0000-0000-000000000006'::UUID, 0.00, false),
    ('20000000-0000-0000-0000-000000000002'::UUID, '00000000-0000-0000-0000-000000000007'::UUID, 0.00, false),
    ('20000000-0000-0000-0000-000000000003'::UUID, '00000000-0000-0000-0000-000000000008'::UUID, 0.00, false)
ON CONFLICT (account_id) DO NOTHING;

-- ============================================================
-- BANK ACCOUNTS (Sample bank accounts for each user)
-- ============================================================
INSERT INTO bank_accounts (bank_account_id, user_id, bank_name, routing_number, account_number, created_at) VALUES
    ('60000000-0000-0000-0000-000000000001'::UUID, '00000000-0000-0000-0000-000000000006'::UUID, 'Chase Bank', '021000021', '1234567890123456', now()),
    ('60000000-0000-0000-0000-000000000002'::UUID, '00000000-0000-0000-0000-000000000006'::UUID, 'Bank of America', '011000015', '9876543210987654', now()),
    ('60000000-0000-0000-0000-000000000003'::UUID, '00000000-0000-0000-0000-000000000007'::UUID, 'Wells Fargo', '121000248', '1111111111111111', now()),
    ('60000000-0000-0000-0000-000000000004'::UUID, '00000000-0000-0000-0000-000000000008'::UUID, 'Citibank', '021000089', '2222222222222222', now())
ON CONFLICT (bank_account_id) DO NOTHING;

-- ============================================================
-- ORDERS (5 sample orders)
-- ============================================================
INSERT INTO orders (order_id, account_id, instrument_id, quantity, order_side, order_type, limit_price, price, status, date_placed) VALUES
    ('30000000-0000-0000-0000-000000000001'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, 10, 'buy', 'market', NULL, 150.25, 'filled', now()),
    ('30000000-0000-0000-0000-000000000002'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000002'::UUID, 5, 'buy', 'limit', 140.00, 139.99, 'filled', now()),
    ('30000000-0000-0000-0000-000000000003'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000003'::UUID, 8, 'buy', 'market', NULL, 380.50, 'filled', now()),
    ('30000000-0000-0000-0000-000000000004'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, 2, 'sell', 'market', NULL, 151.00, 'filled', now()),
    ('30000000-0000-0000-0000-000000000005'::UUID, '20000000-0000-0000-0000-000000000003'::UUID, '10000000-0000-0000-0000-000000000004'::UUID, 15, 'buy', 'limit', 175.00, NULL, 'submitted', now())
ON CONFLICT (order_id) DO NOTHING;

UPDATE orders SET reserved_cash = ceil(quantity * limit_price * 100) / 100
    WHERE reserved_cash IS NULL AND status = 'submitted' AND order_side = 'buy'
      AND order_type IN ('limit', 'stop_limit');

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
INSERT INTO transactions (transaction_id, account_id, instrument_id, txn_type, amount, created_at) VALUES
    ('50000000-0000-0000-0000-000000000001'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, NULL, 'deposit', 50000.00, now()),
    ('50000000-0000-0000-0000-000000000002'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, NULL, 'deposit', 75000.00, now()),
    ('50000000-0000-0000-0000-000000000003'::UUID, '20000000-0000-0000-0000-000000000003'::UUID, NULL, 'deposit', 100000.00, now()),
    ('50000000-0000-0000-0000-000000000004'::UUID, '20000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, 'dividend', 150.00, now()),
    ('50000000-0000-0000-0000-000000000005'::UUID, '20000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000003'::UUID, 'dividend', 200.00, now())
ON CONFLICT (transaction_id) DO NOTHING;

-- ============================================================
-- WATCHLISTS
-- ============================================================
INSERT INTO watchlists (watchlist_id, user_id, created_at, updated_at) VALUES
    ('60000000-0000-0000-0000-000000000001'::UUID, '00000000-0000-0000-0000-000000000006'::UUID, now(), now()),
    ('60000000-0000-0000-0000-000000000002'::UUID, '00000000-0000-0000-0000-000000000007'::UUID, now(), now())
ON CONFLICT (watchlist_id) DO NOTHING;

-- ============================================================
-- WATCHLIST ITEMS
-- ============================================================
INSERT INTO watchlist_items (watchlist_item_id, watchlist_id, instrument_id, added_at) VALUES
    ('61000000-0000-0000-0000-000000000001'::UUID, '60000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000001'::UUID, now()),
    ('61000000-0000-0000-0000-000000000002'::UUID, '60000000-0000-0000-0000-000000000001'::UUID, '10000000-0000-0000-0000-000000000003'::UUID, now()),
    ('61000000-0000-0000-0000-000000000003'::UUID, '60000000-0000-0000-0000-000000000002'::UUID, '10000000-0000-0000-0000-000000000012'::UUID, now())
ON CONFLICT (watchlist_item_id) DO NOTHING;
