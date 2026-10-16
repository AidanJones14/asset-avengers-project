-- Opt-in synthetic demo. Every financial change and audit fact commits together.
-- Uses only dedicated demo UUIDs; reruns preserve subsequent edits/trades.
DO $$
DECLARE
 person RECORD; trade RECORD; uid UUID; aid UUID; iid UUID; oid UUID; at TIMESTAMPTZ;
 start_today TIMESTAMPTZ;
BEGIN
 PERFORM pg_advisory_xact_lock(721920);
 IF EXISTS(SELECT 1 FROM accounts WHERE account_id='de200000-0000-0000-0000-000000000001') THEN
   RAISE NOTICE 'Demo already loaded; balances, holdings and history preserved'; RETURN;
 END IF;
 INSERT INTO instruments(instrument_id,symbol,name,security_type,exchange,currency,is_active)
   VALUES('de600000-0000-0000-0000-000000000001','VOO','Vanguard S&P 500 ETF','etf','NYSEARCA','USD',true) ON CONFLICT(symbol) DO NOTHING;
 start_today:=date_trunc('day',clock_timestamp() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York';
 FOR person IN SELECT * FROM (VALUES
   (1,'cameron.demo@example.com','Cameron','Kelly',25000),
   (2,'carol.demo@example.com','Carol','Jones',15000),
   (3,'daniel.demo@example.com','Daniel','Reed',10000)
 ) AS p(n,email,first_name,last_name,funding) LOOP
   uid:=('de000000-0000-0000-0000-'||lpad(person.n::text,12,'0'))::uuid;
   aid:=('de200000-0000-0000-0000-'||lpad(person.n::text,12,'0'))::uuid;
   INSERT INTO users(user_id,email,name,first_name,last_name,role)
     VALUES(uid,person.email,person.first_name||' '||person.last_name,person.first_name,person.last_name,'client');
   INSERT INTO accounts(account_id,user_id,cash_balance) VALUES(aid,uid,person.funding);
   INSERT INTO bank_accounts(bank_account_id,user_id,bank_name,routing_number,account_number)
     VALUES(('de300000-0000-0000-0000-'||lpad(person.n::text,12,'0'))::uuid,uid,'DEMO BANK — simulated only','021000021','00000000'||person.n);
   INSERT INTO transactions(transaction_id,account_id,txn_type,amount,created_at)
     VALUES(('de400000-0000-0000-0000-'||lpad(person.n::text,12,'0'))::uuid,aid,'deposit',person.funding,start_today-interval '3 days');
   INSERT INTO watchlists(watchlist_id,user_id) VALUES(uid,uid);
   INSERT INTO watchlist_items(watchlist_id,instrument_id)
     SELECT uid,instrument_id FROM instruments WHERE symbol IN ('AAPL','MSFT','NVDA','VOO','WMT');
 END LOOP;
 -- No accepted orders are seeded: the execution worker makes no price requests for these fixtures.
 FOR trade IN SELECT * FROM (VALUES
   (1,1,'AAPL','buy',10,180,2), (2,1,'AAPL','buy',5,190,1),
   (3,1,'MSFT','buy',4,400,1), (4,1,'AAPL','sell',3,200,0),
   (5,2,'VOO','buy',2,500,1), (6,2,'NVDA','buy',8,120,0)
 ) AS t(n,person,symbol,side,quantity,price,days_ago) LOOP
   aid:=('de200000-0000-0000-0000-'||lpad(trade.person::text,12,'0'))::uuid;
   oid:=('de100000-0000-0000-0000-'||lpad(trade.n::text,12,'0'))::uuid;
   SELECT instrument_id INTO STRICT iid FROM instruments WHERE symbol=trade.symbol;
   IF trade.days_ago=0 THEN at:=start_today+(clock_timestamp()-start_today)/2;
   ELSE at:=((start_today AT TIME ZONE 'America/New_York')::date-trade.days_ago+time '09:00') AT TIME ZONE 'America/New_York'; END IF;
   INSERT INTO orders(order_id,account_id,instrument_id,quantity,order_side,order_type,status,reserved_cash,date_placed)
     VALUES(oid,aid,iid,trade.quantity,trade.side,'market','submitted',0,at-interval '2 seconds');
   INSERT INTO order_pricing_evidence(evidence_id,order_id,phase,decision,reason,quote_json,observed_at)
     VALUES(oid,oid,'execution','accepted','Synthetic demo evidence; not a provider quote',
       jsonb_build_object('symbol',trade.symbol,'ask',trade.price,'bid',trade.price,'last',trade.price,
         'currency','USD','asOf',at,'stale',false,'source','demo-seed','synthetic',true)::text,at);
   UPDATE accounts SET cash_balance=cash_balance+CASE WHEN trade.side='sell' THEN 1 ELSE -1 END*trade.quantity*trade.price WHERE account_id=aid;
   INSERT INTO holdings(account_id,instrument_id,quantity)
     VALUES(aid,iid,trade.quantity) ON CONFLICT(account_id,instrument_id) DO UPDATE
       SET quantity=holdings.quantity+CASE WHEN trade.side='sell' THEN -1 ELSE 1 END*trade.quantity;
   INSERT INTO trade_fills(fill_id,order_id,account_id,instrument_id,order_side,quantity,price,cash_amount,executed_at)
     VALUES(oid,oid,aid,iid,trade.side,trade.quantity,trade.price,trade.quantity*trade.price,at);
   UPDATE orders SET status='filled',price=trade.price,date_finalized=at WHERE order_id=oid;
 END LOOP;
 aid:='de200000-0000-0000-0000-000000000003';
 UPDATE accounts SET cash_balance=cash_balance-500 WHERE account_id=aid;
 INSERT INTO transactions(transaction_id,account_id,txn_type,amount,created_at)
   VALUES('de400000-0000-0000-0000-000000000004',aid,'withdrawal',500,start_today-interval '1 day');
 aid:='de200000-0000-0000-0000-000000000001';
 SELECT instrument_id INTO STRICT iid FROM instruments WHERE symbol='AAPL';
 oid:='de100000-0000-0000-0000-000000000007';
 -- An affordable $100 submission estimate becomes unaffordable at $180 execution.
 INSERT INTO orders(order_id,account_id,instrument_id,quantity,order_side,order_type,status,reserved_cash,date_placed)
   VALUES(oid,aid,iid,200,'buy','market','accepted',20000,clock_timestamp()-interval '2 seconds');
 INSERT INTO order_pricing_evidence VALUES('de700000-0000-0000-0000-000000000007',oid,'submission','observed',
   'Synthetic demo: affordable submission estimate',jsonb_build_object('symbol','AAPL','ask',100,'bid',99,'currency','USD',
   'asOf',clock_timestamp()-interval '2 seconds','stale',false,'source','demo-seed','synthetic',true)::text,clock_timestamp()-interval '2 seconds');
 INSERT INTO order_pricing_evidence VALUES(oid,oid,'execution','observed','Synthetic demo: execution price exceeded available cash',
   jsonb_build_object('symbol','AAPL','ask',180,'bid',179,'currency','USD','asOf',clock_timestamp(),
   'stale',false,'source','demo-seed','synthetic',true)::text,clock_timestamp());
 UPDATE orders SET status='rejected',reserved_cash=0,rejection_reason='Insufficient available cash at execution price',date_finalized=clock_timestamp() WHERE order_id=oid;
 -- Demonstrate a real state transition on a newly created demo account only.
 aid:='de200000-0000-0000-0000-000000000003';
 UPDATE accounts SET is_suspended=true WHERE account_id=aid;
 INSERT INTO staff_audit_events(audit_id,actor_id,actor_email,action,target_account_id,reason)
   VALUES('de500000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
   'david.admin@example.com','suspend_client',aid,'Synthetic demo: initial suspension example');
 UPDATE accounts SET is_suspended=false WHERE account_id=aid;
 INSERT INTO staff_audit_events(audit_id,actor_id,actor_email,action,target_account_id,reason)
   VALUES('de500000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
   'david.admin@example.com','unsuspend_client',aid,'Synthetic demo: restore client access');
END $$;
