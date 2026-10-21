-- Run only in an isolated database after admin_analytics_db.schema.sql.
DO $$ BEGIN
  ASSERT reporting.portfolio_class(9999.99)='C';
  ASSERT reporting.portfolio_class(10000)='B';
  ASSERT reporting.portfolio_class(100000)='B';
  ASSERT reporting.portfolio_class(100000.01)='A';
  ASSERT reporting.portfolio_class(NULL) IS NULL;
  ASSERT reporting.portfolio_class(9999.999)='B';
  ASSERT reporting.portfolio_class(100000.004)='B';
  ASSERT reporting.portfolio_class(100000.005)='A';
END $$;
INSERT INTO client_accounts(account_id,client_id,cash_balance,source_updated_at) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',8000,now()),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',1000,now()),
 ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002',500,now()),
 ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000003',100000.01,now()),
 ('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000004',500,now());
INSERT INTO instruments(instrument_id,symbol,is_tradable,source_updated_at) VALUES
 ('30000000-0000-0000-0000-000000000001','TESTUSD',true,now()),
 ('30000000-0000-0000-0000-000000000002','MISSING',true,now()),
 ('30000000-0000-0000-0000-000000000003','TESTGBP',true,now());
INSERT INTO client_positions(account_id,instrument_id,quantity,source_updated_at) VALUES
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',20,now()),
 ('10000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002',1,now()),
 ('10000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002',0,now()),
 ('10000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000003',1,now());
INSERT INTO reporting.instrument_marks VALUES
 ('TESTUSD',150,'USD',now(),now(),false),('TESTGBP',50,'GBP',now(),now(),false);
DO $$ DECLARE r RECORD; BEGIN
 SELECT * INTO r FROM reporting.client_portfolios WHERE client_id='20000000-0000-0000-0000-000000000001';
 ASSERT r.portfolio_value=12000 AND r.portfolio_class='B' AND r.valuation_status='observed';
 SELECT * INTO r FROM reporting.client_portfolios WHERE client_id='20000000-0000-0000-0000-000000000002';
 ASSERT r.portfolio_value IS NULL AND r.portfolio_class IS NULL AND r.valuation_status='unpriced';
 SELECT * INTO r FROM reporting.client_portfolios WHERE client_id='20000000-0000-0000-0000-000000000003';
 ASSERT r.portfolio_value=100000.01 AND r.portfolio_class='A';
 SELECT * INTO r FROM reporting.client_portfolios WHERE client_id='20000000-0000-0000-0000-000000000004';
 ASSERT r.portfolio_value IS NULL AND r.portfolio_class IS NULL;
END $$;
UPDATE reporting.instrument_marks SET quote_at=now()-interval '48 hours' WHERE symbol='TESTUSD';
DO $$ BEGIN
 ASSERT (SELECT valuation_status='stale' AND portfolio_class='B' FROM reporting.client_portfolios
   WHERE client_id='20000000-0000-0000-0000-000000000001');
END $$;
SET ROLE analytics_analyst;
SELECT count(*) FROM reporting.client_portfolios;
SELECT count(*) FROM reporting.database_guide;
RESET ROLE;
