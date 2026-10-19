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
    assert target.execute('SELECT sum(cash_balance) FROM client_accounts').fetchone()[0]==Decimal('1245271')
    assert target.execute('SELECT count(*) FROM reporting.client_directory').fetchone()[0]==27
    # Name enrichment must neither drop facts nor multiply trades/cash for duplicate names.
    assert target.execute("SELECT count(*) FROM admin.trades WHERE client_name='Cameron Kelly'").fetchone()[0]==5
    # Execute exactly the publication code shipped in the demo shell helper.
    script=Path('/workspace/scripts/load-demo-data.sh').read_text().split("<<'PYTHON'\n",1)[1].split('\nPYTHON\n',1)[0]
    exec(compile(script,'load-demo-data.sh','exec'),{})
    exec(compile(script,'load-demo-data.sh','exec'),{})
    assert target.execute('SELECT count(*),sum(cash_amount) FROM analytics.named_published_trades').fetchone()==target.execute('SELECT count(*),sum(cash_amount) FROM analytics.published_trades').fetchone()
    assert target.execute("SELECT count(*) FROM analytics.named_published_trades WHERE client_name='Cameron Kelly' AND client_label LIKE 'Cameron Kelly (%'").fetchone()[0]==4
    assert target.execute('SELECT count(*),sum(cash_amount) FROM analytics.published_trades').fetchone()==(486,source.execute('SELECT sum(cash_amount) AS amount FROM trade_fills').fetchone()['amount'])
    assert target.execute("SELECT count(*) FROM admin_audit_log WHERE reason LIKE 'Synthetic demo:%'").fetchone()[0]==2
    print('Demo projection, replay, worker permissions and repeated publication without double counting: passed')
