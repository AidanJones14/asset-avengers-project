"""Real projection/publication checks for the opt-in demo loader."""
from datetime import datetime,timedelta,timezone
from decimal import Decimal
import json
import os
from pathlib import Path
import sys
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import set_json_loads
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from projection import apply_event

set_json_loads(lambda value:json.loads(value,parse_float=Decimal))
with psycopg.connect(host='postgres',dbname='demo_source',user=os.environ['PIPELINE_TEST_USER'],password=os.environ['PIPELINE_TEST_PASSWORD'],autocommit=True,row_factory=dict_row) as source,psycopg.connect(host='postgres',dbname='demo_target',user=os.environ['REPORTING_DB_USER'],password=os.environ['REPORTING_DB_PASSWORD'],autocommit=True) as target:
    events=source.execute('SELECT event_id,record_type,payload,created_at FROM audit_outbox ORDER BY sequence_id').fetchall()
    for event in events:
        with target.transaction():apply_event(target,event)
    for event in events:
        with target.transaction():assert apply_event(target,event) is False
    # Controlled test heartbeat only: readiness is separate from report arithmetic.
    with target.transaction():apply_event(target,{'event_id':'de999999-0000-0000-0000-000000000001','record_type':'heartbeat','created_at':datetime.now(timezone.utc)+timedelta(minutes=1),'payload':{'schema_version':1,'operation':'HEARTBEAT','row':{}}})
    assert target.execute('SELECT sum(cash_balance) FROM client_accounts').fetchone()[0]==source.execute('SELECT sum(cash_balance) AS amount FROM accounts').fetchone()['amount']
    assert target.execute('SELECT count(*) FROM reporting.client_directory').fetchone()[0]==99
    # Name enrichment must neither drop facts nor multiply trades/cash for duplicate names.
    assert target.execute("SELECT count(*) FROM admin.trades WHERE client_name='Cameron Kelly'").fetchone()[0]==5
    # Execute exactly the publication code shipped in the demo shell helper.
    script=Path('/workspace/scripts/load-demo-data.sh').read_text().split("<<'PYTHON'\n",1)[1].split('\nPYTHON\n',1)[0]
    sys.argv=['demo-loader',json.dumps(dict(fills=2540,accounts=100,orders=2553,movements=source.execute('SELECT count(*) AS n FROM cash_ledger').fetchone()['n']))]
    exec(compile(script,'load-demo-data.sh','exec'),{})
    exec(compile(script,'load-demo-data.sh','exec'),{})
    assert target.execute('SELECT count(*),sum(cash_amount) FROM analytics.named_published_trades').fetchone()==target.execute('SELECT count(*),sum(cash_amount) FROM analytics.published_trades').fetchone()
    # These are exactly the distinct values requested by Superset's Asset type filter.
    expected_types={'equity','etf','bond','option','future','crypto','mutual_fund'}
    visible_types={row[0] for row in target.execute('SELECT DISTINCT security_type FROM analytics.named_published_trades').fetchall()}
    assert visible_types==expected_types, visible_types
    for asset_type in expected_types:
        count,notional=target.execute('SELECT count(*),sum(cash_amount) FROM analytics.named_published_trades WHERE security_type=%s',(asset_type,)).fetchone()
        assert count>=2 and notional>0, (asset_type,count,notional)
    assert target.execute("SELECT count(*),sum(cash_amount) FROM analytics.named_published_trades WHERE client_name='Daniel Reed'").fetchone()==(14,Decimal('2944.00'))
    assert target.execute('SELECT count(DISTINCT account_type) FROM analytics.named_published_trades').fetchone()[0]==4
    assert target.execute('SELECT count(*) FROM analytics.named_published_trades WHERE account_id IS NULL OR account_name IS NULL OR account_type IS NULL').fetchone()[0]==0
    assert target.execute('SELECT count(*) FROM reporting.investment_accounts').fetchone()[0]==100
    assert target.execute("SELECT count(*) FROM analytics.trade_facts WHERE account_name IS NOT NULL AND account_type IS NOT NULL").fetchone()[0]>0

    assert target.execute("SELECT count(*) FROM analytics.named_published_trades WHERE client_name='Cameron Kelly' AND client_label LIKE 'Cameron Kelly (%'").fetchone()[0]==4
    assert target.execute('SELECT count(*),sum(cash_amount) FROM analytics.published_trades').fetchone()==(2540,source.execute('SELECT sum(cash_amount) AS amount FROM trade_fills').fetchone()['amount'])
    assert target.execute("SELECT count(*) FROM admin_audit_log WHERE reason LIKE 'Synthetic demo:%'").fetchone()[0]==source.execute("SELECT count(*) AS n FROM staff_audit_events WHERE reason LIKE 'Synthetic demo:%'").fetchone()['n']
    classes=target.execute("SELECT portfolio_class FROM reporting.client_portfolios WHERE client_id::text IN ('de000000-0000-0000-0000-000000000201','de000000-0000-0000-0000-000000000202','de000000-0000-0000-0000-000000000203','de000000-0000-0000-0000-000000000204') ORDER BY client_id").fetchall()
    assert [r[0] for r in classes]==['C','B','B','A']
    print('Demo projection, replay, worker permissions and repeated publication without double counting: passed')
