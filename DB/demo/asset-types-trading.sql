-- Additive reporting demo: one closed buy/sell pair for every recognized asset type.
-- All seven use the simulator's quantity * unit price arithmetic, not specialized
-- option multipliers, futures margin, bond accrued interest or mutual-fund NAV rules.
-- Synthetic-only instruments are inactive so users cannot request real executions.
DO $$
DECLARE
 asset RECORD; iid UUID; aid UUID := 'de200000-0000-0000-0000-000000000003';
 buy_id UUID; sell_id UUID; oid UUID; at TIMESTAMPTZ; side TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(721920);
 IF NOT EXISTS(SELECT 1 FROM accounts a JOIN users u USING(user_id)
   WHERE a.account_id=aid AND u.email='daniel.demo@example.com')
 THEN RAISE EXCEPTION 'Load the original Daniel Reed demo account before asset-type fixtures'; END IF;

 FOR asset IN SELECT * FROM (VALUES
   (1,'AAPL','equity','Apple Inc.',200::numeric,1::numeric),
   (2,'VOO','etf','Vanguard S&P 500 ETF',500,1),
   (3,'X:BTC-USD','crypto','Bitcoin',60000,0.01),
   (4,'DEMO-BOND','bond','DEMO - synthetic bond unit',100,1),
   (5,'DEMO-OPTION','option','DEMO - synthetic option unit (no contract multiplier)',2,1),
   (6,'DEMO-FUTURE','future','DEMO - synthetic future unit (no margin model)',20,1),
   (7,'DEMO-MUTUAL','mutual_fund','DEMO - synthetic mutual fund unit',50,1)
 ) AS v(n,symbol,asset_type,name,unit_price,quantity) LOOP
   -- Catalogue upserts for real symbols remain the responsibility of instruments.seed.sql.
   INSERT INTO instruments(instrument_id,symbol,name,security_type,exchange,currency,is_active)
     VALUES(('de700000-0000-0000-0000-'||lpad(asset.n::text,12,'0'))::uuid,
       asset.symbol,asset.name,asset.asset_type,'DEMO','USD',false)
     ON CONFLICT(symbol) DO NOTHING;
   SELECT instrument_id INTO STRICT iid FROM instruments
     WHERE symbol=asset.symbol AND security_type=asset.asset_type AND currency='USD';
   buy_id:=('de100000-0000-0000-0000-'||lpad((900700+asset.n*2)::text,12,'0'))::uuid;
   sell_id:=('de100000-0000-0000-0000-'||lpad((900701+asset.n*2)::text,12,'0'))::uuid;
   IF EXISTS(SELECT 1 FROM orders WHERE order_id IN (buy_id,sell_id)) THEN
     -- Never overwrite later user actions or silently accept another fixture's IDs.
     IF (SELECT count(*) FROM trade_fills WHERE fill_id IN (buy_id,sell_id)
       AND account_id=aid AND instrument_id=iid AND quantity=asset.quantity
       AND price=asset.unit_price AND ((fill_id=buy_id AND order_side='buy')
         OR (fill_id=sell_id AND order_side='sell')))!=2
     THEN RAISE EXCEPTION 'Asset-type demo order identity collision for %',asset.symbol; END IF;
     CONTINUE;
   END IF;
   -- Yesterday's closed position is visible after publication regardless of market hours.
   at:=(((clock_timestamp() AT TIME ZONE 'America/New_York')::date-1)+time '10:00')
     AT TIME ZONE 'America/New_York';
   FOR side IN SELECT unnest(ARRAY['buy','sell']) LOOP
     oid:=CASE WHEN side='buy' THEN buy_id ELSE sell_id END;
     IF side='sell' THEN at:=at+interval '1 minute'; END IF;
     INSERT INTO orders(order_id,account_id,instrument_id,quantity,order_side,order_type,status,date_placed,reserved_cash)
       VALUES(oid,aid,iid,asset.quantity,side,'market','submitted',at-interval '1 second',0);
     INSERT INTO order_pricing_evidence(evidence_id,order_id,phase,decision,reason,quote_json,observed_at)
       VALUES(oid,oid,'execution','observed','Synthetic asset-type filter demonstration; unit pricing only, not a provider quote',
         jsonb_build_object('symbol',asset.symbol,'price',asset.unit_price,'ask',asset.unit_price,
           'bid',asset.unit_price,'currency','USD','asOf',at,'stale',false,
           'source','demo-seed','synthetic',true)::text,at);
     UPDATE accounts SET cash_balance=cash_balance+
       CASE WHEN side='buy' THEN -1 ELSE 1 END*asset.quantity*asset.unit_price WHERE account_id=aid;
     INSERT INTO holdings(account_id,instrument_id,quantity) VALUES(aid,iid,asset.quantity)
       ON CONFLICT(account_id,instrument_id) DO UPDATE
       SET quantity=holdings.quantity+CASE WHEN side='buy' THEN 1 ELSE -1 END*asset.quantity;
     INSERT INTO trade_fills(fill_id,order_id,account_id,instrument_id,order_side,quantity,price,cash_amount,executed_at)
       VALUES(oid,oid,aid,iid,side,asset.quantity,asset.unit_price,asset.quantity*asset.unit_price,at);
     UPDATE orders SET status='filled',price=asset.unit_price,date_finalized=at WHERE order_id=oid;
   END LOOP;
 END LOOP;
END $$;
