-- Additive extension: 72 clients, 2,040 filled trades, 12 rejections/disputes,
-- fractional quantities and 90 days of activity. No provider calls or pending orders.
-- Closed buy/sell pairs make portfolio class demos independent of synthetic market prices.
DO $$
DECLARE person RECORD; uid UUID; aid UUID; iid UUID; oid UUID; at TIMESTAMPTZ;
 k INT; pair INT; qty NUMERIC(18,4); px NUMERIC(18,4); side TEXT; demo_symbol TEXT; funding NUMERIC(18,2);
 symbols TEXT[]:=ARRAY['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','WMT','JPM','VOO'];
BEGIN
 PERFORM pg_advisory_xact_lock(721920);
 FOR person IN SELECT n,
 (ARRAY['Avery','Cameron','Casey','Jordan','Morgan','Riley','Sam','Taylor','Alex','Jamie','Robin','Skyler'])[(n-201)%12+1] AS first_name,
 (ARRAY['Adams','Bennett','Clark','Davis','Ellis','Franklin'])[(n-201)/12+1] AS last_name,
 'client.'||n||'.demo@example.com' AS email
 FROM generate_series(201,272) n LOOP
   uid:=('de000000-0000-0000-0000-'||lpad(person.n::text,12,'0'))::uuid;
   aid:=('de200000-0000-0000-0000-'||lpad(person.n::text,12,'0'))::uuid;
   IF EXISTS(SELECT 1 FROM accounts WHERE account_id=aid) THEN
     IF NOT EXISTS(SELECT 1 FROM accounts a JOIN users u USING(user_id)
       WHERE a.account_id=aid AND a.user_id=uid AND u.email=person.email)
     THEN RAISE EXCEPTION 'Presentation account identity collision'; END IF;
     CONTINUE;
   END IF;
   funding:=CASE person.n WHEN 201 THEN 9999.99 WHEN 202 THEN 10000
     WHEN 203 THEN 100000 WHEN 204 THEN 100000.01
     ELSE CASE person.n%3 WHEN 0 THEN 250000 WHEN 1 THEN 50000 ELSE 5000 END END;
   INSERT INTO users(user_id,email,name,first_name,last_name,role)
     VALUES(uid,person.email,person.first_name||' '||person.last_name,person.first_name,person.last_name,'client');
   INSERT INTO accounts(account_id,user_id,cash_balance) VALUES(aid,uid,funding);
   INSERT INTO transactions(account_id,txn_type,amount,created_at)
     VALUES(aid,'deposit',funding,clock_timestamp()-interval '91 days');
   INSERT INTO bank_accounts(bank_account_id,user_id,bank_name,routing_number,account_number)
     VALUES(aid,uid,'DEMO BANK - synthetic','021000021','DEMO'||person.n);
   INSERT INTO watchlists(watchlist_id,user_id) VALUES(uid,uid);
   INSERT INTO watchlist_items(watchlist_id,instrument_id)
     SELECT uid,instrument_id FROM instruments WHERE symbol=ANY(symbols);
   -- Four cash-only clients show precise band boundaries without price assumptions.
   IF person.n<=204 THEN CONTINUE; END IF;
   qty:=0.25+(person.n%4)*0.5;
   FOR k IN 1..30 LOOP
     pair:=(k+1)/2; demo_symbol:=symbols[(pair-1)%10+1];
     side:=CASE WHEN k%2=1 THEN 'buy' ELSE 'sell' END;
     px:=100+((pair-1)%10+1)*10+CASE WHEN side='sell' THEN person.n%5-2 ELSE 0 END;
     SELECT instrument_id INTO STRICT iid FROM instruments WHERE symbol=demo_symbol;
     oid:=('de100000-0000-0000-0000-'||lpad((person.n*100+k)::text,12,'0'))::uuid;
     at:=(((clock_timestamp() AT TIME ZONE 'America/New_York')::date
       -(1+(person.n*7+pair*3)%90))+time '09:00') AT TIME ZONE 'America/New_York';
     at:=at+make_interval(mins=>k);
     INSERT INTO orders(order_id,account_id,instrument_id,quantity,order_side,order_type,status,date_placed,reserved_cash)
       VALUES(oid,aid,iid,qty,side,'market','submitted',at-interval '1 second',0);
     INSERT INTO order_pricing_evidence(evidence_id,order_id,phase,decision,reason,quote_json,observed_at)
       VALUES(oid,oid,'execution','observed','Synthetic presentation data; not a live provider quote',
       jsonb_build_object('symbol',demo_symbol,'price',px,'ask',px,'bid',px,'currency','USD',
         'asOf',at,'stale',false,'source','demo-seed','synthetic',true)::text,at);
     UPDATE accounts SET cash_balance=cash_balance+CASE WHEN side='buy' THEN -1 ELSE 1 END*qty*px WHERE account_id=aid;
     INSERT INTO holdings(account_id,instrument_id,quantity) VALUES(aid,iid,qty)
       ON CONFLICT(account_id,instrument_id) DO UPDATE
       SET quantity=holdings.quantity+CASE WHEN side='buy' THEN 1 ELSE -1 END*qty;
     INSERT INTO trade_fills(fill_id,order_id,account_id,instrument_id,order_side,quantity,price,cash_amount,executed_at)
       VALUES(oid,oid,aid,iid,side,qty,px,qty*px,at);
     UPDATE orders SET status='filled',price=px,date_finalized=at WHERE order_id=oid;
   END LOOP;
   -- Show deposits/withdrawals/dividends in the source ledger, all reconciled to cash.
   IF person.n%7=0 THEN
     UPDATE accounts SET cash_balance=cash_balance-100 WHERE account_id=aid;
     INSERT INTO transactions(account_id,txn_type,amount) VALUES(aid,'withdrawal',100);
     UPDATE accounts SET cash_balance=cash_balance+10 WHERE account_id=aid;
     INSERT INTO transactions(account_id,instrument_id,txn_type,amount) VALUES(aid,iid,'dividend',10);
   END IF;
   IF person.n>=261 THEN
     oid:=('de100000-0000-0000-0000-'||lpad((person.n*100+31)::text,12,'0'))::uuid;
     INSERT INTO orders(order_id,account_id,instrument_id,quantity,order_side,order_type,status,date_placed,reserved_cash)
       VALUES(oid,aid,iid,100000,'buy','market','submitted',clock_timestamp()-interval '1 second',0);
     INSERT INTO order_pricing_evidence(evidence_id,order_id,phase,decision,reason,quote_json,observed_at)
       VALUES(oid,oid,'execution','observed','Synthetic presentation: insufficient available cash',
       jsonb_build_object('symbol',demo_symbol,'price',px,'ask',px,'bid',px,'currency','USD',
         'asOf',clock_timestamp(),'source','demo-seed','synthetic',true)::text,clock_timestamp());
     UPDATE orders SET status='rejected',rejection_reason='Insufficient available cash at execution price',
       date_finalized=clock_timestamp() WHERE order_id=oid;
     INSERT INTO client_disputes(dispute_id,account_id,order_id,category,description,status)
       VALUES(oid,aid,oid,'funding','Synthetic demo: please review this insufficient-cash order and explain the available balance.',
         CASE person.n%3 WHEN 0 THEN 'submitted' WHEN 1 THEN 'in_review' ELSE 'resolved' END);
   END IF;
   IF person.n%12=0 THEN
     UPDATE accounts SET is_suspended=true WHERE account_id=aid;
     INSERT INTO staff_audit_events(actor_id,actor_email,action,target_account_id,reason)
       VALUES('00000000-0000-0000-0000-000000000001','david.admin@example.com','suspend_client',aid,
         'Synthetic demo: suspended account for administrative review');
   END IF;
 END LOOP;
END $$;
