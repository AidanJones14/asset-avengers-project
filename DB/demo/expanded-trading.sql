-- Additive presentation fixture: 24 clients, 480 fills, 30 calendar days, 10 symbols.
-- Each buy/sell pair reconciles cash and shares. No open orders or paid quote calls.
DO $$
DECLARE person RECORD; uid UUID; aid UUID; iid UUID; oid UUID; at TIMESTAMPTZ;
 n INT; k INT; pair INT; qty INT; px NUMERIC; side TEXT; demo_symbol TEXT;
 symbols TEXT[]:=ARRAY['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','WMT','JPM','VOO'];
BEGIN
 PERFORM pg_advisory_xact_lock(721920);
 FOR person IN SELECT * FROM (VALUES (101,'Amelia','Carter','amelia.carter.demo@example.com'),(102,'Benjamin','Brooks','benjamin.brooks.demo@example.com'),(103,'Charlotte','Chen','charlotte.chen.demo@example.com'),(104,'Daniel','Diaz','daniel.diaz.demo@example.com'),(105,'Elena','Evans','elena.evans.demo@example.com'),(106,'Farah','Foster','farah.foster.demo@example.com'),(107,'Gabriel','Green','gabriel.green.demo@example.com'),(108,'Harper','Hayes','harper.hayes.demo@example.com'),(109,'Isaac','Ibrahim','isaac.ibrahim.demo@example.com'),(110,'Jasmine','Jones','jasmine.jones.demo@example.com'),(111,'Kai','Kim','kai.kim.demo@example.com'),(112,'Layla','Lewis','layla.lewis.demo@example.com'),(113,'Mason','Martin','mason.martin.demo@example.com'),(114,'Nora','Nguyen','nora.nguyen.demo@example.com'),(115,'Oliver','Owens','oliver.owens.demo@example.com'),(116,'Priya','Patel','priya.patel.demo@example.com'),(117,'Quinn','Quinn','quinn.quinn.demo@example.com'),(118,'Rafael','Reed','rafael.reed.demo@example.com'),(119,'Sofia','Singh','sofia.singh.demo@example.com'),(120,'Theo','Taylor','theo.taylor.demo@example.com'),(121,'Uma','Underwood','uma.underwood.demo@example.com'),(122,'Victor','Vargas','victor.vargas.demo@example.com'),(123,'Willow','Walker','willow.walker.demo@example.com'),(124,'Zoe','Zhang','zoe.zhang.demo@example.com')) AS p(n,first_name,last_name,email) LOOP
   n:=person.n; uid:=('de000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
   aid:=('de200000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
   -- A per-client marker makes this extension safe even after the original demo was loaded.
   IF EXISTS(SELECT 1 FROM accounts WHERE account_id=aid) THEN CONTINUE; END IF;
   INSERT INTO users(user_id,email,name,first_name,last_name,role)
     VALUES(uid,person.email,person.first_name||' '||person.last_name,person.first_name,person.last_name,'client');
   INSERT INTO accounts(account_id,user_id,cash_balance) VALUES(aid,uid,50000);
   INSERT INTO transactions(transaction_id,account_id,txn_type,amount,created_at)
     VALUES(aid,aid,'deposit',50000,clock_timestamp()-interval '31 days');
   INSERT INTO bank_accounts(bank_account_id,user_id,bank_name,routing_number,account_number)
     VALUES(aid,uid,'DEMO BANK - synthetic','021000021','DEMO'||n);
   INSERT INTO watchlists(watchlist_id,user_id) VALUES(uid,uid);
   INSERT INTO watchlist_items(watchlist_id,instrument_id)
     SELECT uid,instrument_id FROM instruments WHERE instruments.symbol=ANY(symbols);
   qty:=1+n%5;
   FOR k IN 1..20 LOOP
     pair:=(k+1)/2; demo_symbol:=symbols[pair]; side:=CASE WHEN k%2=1 THEN 'buy' ELSE 'sell' END;
     px:=100+pair*10+CASE WHEN side='sell' THEN 2 ELSE 0 END;
     SELECT instrument_id INTO STRICT iid FROM instruments WHERE instruments.symbol=demo_symbol;
     oid:=('de100000-0000-0000-0000-'||lpad((n*100+k)::text,12,'0'))::uuid;
     at:=date_trunc('day',clock_timestamp())-make_interval(days=>30-((n-101+pair*2)%30))+interval '1 hour'+make_interval(mins=>k);
     INSERT INTO orders(order_id,account_id,instrument_id,quantity,order_side,order_type,status,date_placed,reserved_cash)
       VALUES(oid,aid,iid,qty,side,'market','submitted',at-interval '1 second',0);
     INSERT INTO order_pricing_evidence(evidence_id,order_id,phase,decision,reason,quote_json,observed_at)
       VALUES(oid,oid,'execution','observed','Synthetic presentation data; not a live provider quote',
         jsonb_build_object('symbol',demo_symbol,'price',px,'ask',px,'bid',px,'asOf',at,'currency','USD',
           'stale',false,'source','demo-seed','synthetic',true)::text,at);
     UPDATE accounts SET cash_balance=cash_balance+CASE WHEN side='buy' THEN -1 ELSE 1 END*qty*px WHERE account_id=aid;
     INSERT INTO holdings(account_id,instrument_id,quantity) VALUES(aid,iid,qty)
       ON CONFLICT(account_id,instrument_id) DO UPDATE SET quantity=holdings.quantity+CASE WHEN side='buy' THEN 1 ELSE -1 END*qty;
     INSERT INTO trade_fills(fill_id,order_id,account_id,instrument_id,order_side,quantity,price,cash_amount,executed_at)
       VALUES(oid,oid,aid,iid,side,qty,px,qty*px,at);
     UPDATE orders SET status='filled',price=px,date_finalized=at WHERE order_id=oid;
   END LOOP;
 END LOOP;
END $$;
