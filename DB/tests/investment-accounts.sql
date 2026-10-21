-- Run only in an isolated reporting database after its schema. Never seed real reports.
INSERT INTO client_accounts(account_id,client_id,cash_balance,source_updated_at,account_name,account_type) VALUES
 ('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',1000,now(),'Original retirement','Roth IRA'),
 ('a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003',0,now(),'Health savings','Health Savings Account (HSA)');
INSERT INTO trade_records(order_id,client_id,account_id,instrument_id,symbol,order_side,order_type,quantity,placed_at) VALUES
 ('a1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','TEST','buy','market',1,now());
INSERT INTO integration.report_batches(batch_id,report_date,period_start,cutoff_at,status) VALUES
 ('a1000000-0000-0000-0000-000000000006','2001-01-01','2001-01-01T00:00:00Z','2001-01-02T00:00:00Z','published'),
 ('a1000000-0000-0000-0000-000000000007','2001-01-01','2001-01-01T00:00:00Z','2001-01-02T00:00:00Z','published');
-- A pre-upgrade batch has no account metadata in its immutable facts.
INSERT INTO analytics.trade_facts(batch_id,fill_id,report_date,client_id,order_id,instrument_id,symbol,security_type,order_side,quantity,price,cash_amount,executed_at)
SELECT 'a1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000008','2001-01-01',client_id,order_id,instrument_id,symbol,'equity',order_side,quantity,100,100,'2001-01-01T12:00:00Z'
FROM trade_records WHERE order_id='a1000000-0000-0000-0000-000000000005';
INSERT INTO integration.published_reports VALUES('2001-01-01','a1000000-0000-0000-0000-000000000006');
UPDATE client_accounts SET account_name='Current retirement' WHERE account_id='a1000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 ASSERT (SELECT account_name='Current retirement' AND account_type='Roth IRA' FROM analytics.named_published_trades WHERE report_date='2001-01-01');
 ASSERT (SELECT account_id IS NULL AND account_name IS NULL FROM analytics.trade_facts WHERE batch_id='a1000000-0000-0000-0000-000000000006');
 ASSERT (SELECT count(*)=2 FROM reporting.investment_accounts WHERE client_id='a1000000-0000-0000-0000-000000000003');
END $$;
-- A new version saves its labels at publication. Later renames cannot replace them.
INSERT INTO analytics.trade_facts(batch_id,fill_id,report_date,client_id,order_id,instrument_id,symbol,security_type,order_side,quantity,price,cash_amount,executed_at,account_id,account_name,account_type)
SELECT 'a1000000-0000-0000-0000-000000000007',fill_id,report_date,client_id,order_id,instrument_id,symbol,security_type,order_side,quantity,price,cash_amount,executed_at,
 'a1000000-0000-0000-0000-000000000001','Saved publication name','Roth IRA'
FROM analytics.trade_facts WHERE batch_id='a1000000-0000-0000-0000-000000000006';
UPDATE integration.published_reports SET batch_id='a1000000-0000-0000-0000-000000000007' WHERE report_date='2001-01-01';
UPDATE client_accounts SET account_name='Renamed after publication' WHERE account_id='a1000000-0000-0000-0000-000000000001';
DO $$ BEGIN
 ASSERT (SELECT account_name='Saved publication name' FROM analytics.named_published_trades WHERE report_date='2001-01-01');
 ASSERT (SELECT trade_count=1 AND traded_notional=100 FROM analytics.business_overview WHERE report_date='2001-01-01');
END $$;
