import time
from datetime import date
from decimal import Decimal
from pipeline import connect
from reports import build_report

with connect() as target:
    for attempt in range(60):
        result=target.execute("SELECT cash_delta FROM cash_holding_changes WHERE change_id='50000000-0000-0000-0000-000000000001'").fetchone()
        heartbeat=target.execute("SELECT source_heartbeat_at FROM integration.pipeline_status WHERE pipeline='trading'").fetchone()
        if result and heartbeat and heartbeat[0]: break
        time.sleep(1)
    assert result==(Decimal('-100'),),'Kafka consumer did not ingest the source fill'
    build_report(target,date(2026,10,1))
    assert target.execute('SELECT count(*),sum(cash_amount) FROM analytics.published_trades').fetchone()==(1,Decimal('100'))
    print('Actual Kafka source-to-report path passed')
