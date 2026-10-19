BEGIN;
INSERT INTO users(user_id,email,role) VALUES ('00000000-0000-0000-0000-000000000001','demo@example.invalid','client');
INSERT INTO accounts(account_id,user_id,account_name,account_type,cash_balance) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Demo brokerage','Individual Brokerage',1000);
INSERT INTO instruments(instrument_id,symbol,name,security_type,exchange,currency,is_active)
VALUES ('20000000-0000-0000-0000-000000000001','local deployment','local deployment test','equity','TEST','USD',TRUE);
INSERT INTO orders(order_id,account_id,instrument_id,order_type,order_side,quantity,status,reserved_cash,date_placed)
VALUES ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','market','buy',1,'accepted',100,'2026-10-01T13:00:00Z');
INSERT INTO order_pricing_evidence VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','execution','observed',NULL,
'{"symbol":"local deployment","ask":100,"bid":99,"currency":"USD","stale":true,"asOf":"2026-09-30T20:00:00Z"}','2026-10-01T13:00:01Z');
UPDATE accounts SET cash_balance=900 WHERE account_id='10000000-0000-0000-0000-000000000001';
INSERT INTO holdings(account_id,instrument_id,quantity) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1);
INSERT INTO trade_fills VALUES ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','buy',1,100,100,'2026-10-01T13:00:02Z');
UPDATE orders SET status='filled',price=100,reserved_cash=0,date_finalized='2026-10-01T13:00:02Z' WHERE order_id='30000000-0000-0000-0000-000000000001';
COMMIT;
