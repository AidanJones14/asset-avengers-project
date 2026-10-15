"""Real PostgreSQL checks, launched by scripts/verify-admin-analytics.py."""
import json
import os
import sys
from datetime import date, datetime, timezone, time
from decimal import Decimal
from pathlib import Path
from uuid import uuid4
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import set_json_loads
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from projection import apply_event
from reports import build_report, period, configured_time

set_json_loads(lambda text:json.loads(text,parse_float=Decimal))


def connect(database):
    return psycopg.connect(host='postgres',dbname=database,user=os.environ['PIPELINE_TEST_USER'],
        password=os.environ['PIPELINE_TEST_PASSWORD'],autocommit=True)


def deliver(source,target):
    with source.cursor(row_factory=dict_row) as cur:
        cur.execute('SELECT event_id,record_type,payload,created_at FROM audit_outbox ORDER BY sequence_id')
        events=cur.fetchall()
    for event in events:
        with target.transaction(): apply_event(target,event)
    return events


with connect(os.environ['PIPELINE_SOURCE_DB']) as source,connect(os.environ['PIPELINE_TARGET_DB']) as target:
    # Exercise the actual worker grants, not a superuser-only projection.
    target.execute('SET ROLE analytics_etl')
    user,account,instrument,order,fill=[uuid4() for _ in range(5)]
    with source.transaction():
        source.execute("INSERT INTO users(user_id,email,role) VALUES (%s,'test@example.invalid','client')",(user,))
        source.execute('INSERT INTO accounts(account_id,user_id,cash_balance) VALUES (%s,%s,100)',(account,user))
        source.execute("INSERT INTO instruments(instrument_id,symbol,name,security_type,exchange,currency,is_active) VALUES (%s,'TEST','Test instrument','equity','TEST','USD',TRUE)",(instrument,))
        source.execute("""INSERT INTO orders(order_id,account_id,instrument_id,order_type,order_side,quantity,status,reserved_cash,date_placed)
            VALUES (%s,%s,%s,'market','buy',0.0001,'accepted',0.01,'2026-10-01T13:00:00Z')""",(order,account,instrument))
    deliver(source,target)
    assert target.execute('SELECT count(*) FROM trade_records').fetchone()[0]==1
    # A rolled-back source transaction must leave neither lifecycle nor outbox data.
    before=source.execute('SELECT count(*) FROM audit_outbox').fetchone()[0]
    try:
        with source.transaction():
            source.execute("UPDATE orders SET status='rejected',rejection_reason='test rollback' WHERE order_id=%s",(order,))
            raise ValueError('rollback')
    except ValueError: pass
    assert source.execute('SELECT count(*) FROM audit_outbox').fetchone()[0]==before
    # Invalid pricing is an attempt rejection. The order is still accepted/retryable.
    quote=json.dumps({'symbol':'TEST','ask':'10.0001','bid':'10','currency':'USD','stale':True,'asOf':'2026-09-30T20:00:00Z'})
    source.execute("INSERT INTO order_pricing_evidence VALUES (%s,%s,'execution','rejected','Invalid timestamp',%s,'2026-10-01T13:00:01Z')",(uuid4(),order,quote))
    deliver(source,target)
    assert target.execute('SELECT status FROM admin.trades WHERE order_id=%s',(order,)).fetchone()[0]=='accepted'
    with source.transaction():
        source.execute('UPDATE accounts SET cash_balance=99.99 WHERE account_id=%s',(account,))
        source.execute('INSERT INTO holdings(account_id,instrument_id,quantity) VALUES (%s,%s,0.0001)',(account,instrument))
        source.execute("INSERT INTO trade_fills VALUES (%s,%s,%s,%s,'buy',0.0001,10.0001,0.01,'2026-10-01T13:00:03Z')",(fill,order,account,instrument))
        source.execute("UPDATE orders SET status='filled',price=10.0001,reserved_cash=0,date_finalized='2026-10-01T13:00:03Z' WHERE order_id=%s",(order,))
    events=deliver(source,target)
    for event in reversed(events):
        with target.transaction(): assert apply_event(target,event) is False
    assert target.execute('SELECT cash_delta FROM cash_holding_changes WHERE change_id=%s',(fill,)).fetchone()[0]==Decimal('-0.01')
    assert target.execute('SELECT count(*) FROM cash_holding_changes').fetchone()[0]==1
    assert target.execute('SELECT status FROM admin.trades WHERE order_id=%s',(order,)).fetchone()[0]=='filled'
    # A later trade from the same calendar day is excluded by the 19:00 cutoff.
    late_order,late_fill=uuid4(),uuid4()
    with source.transaction():
        source.execute("""INSERT INTO orders(order_id,account_id,instrument_id,order_type,order_side,quantity,status,reserved_cash,date_placed)
            VALUES (%s,%s,%s,'market','buy',1,'accepted',10,'2026-10-01T23:00:01Z')""",(late_order,account,instrument))
        source.execute("INSERT INTO trade_fills VALUES (%s,%s,%s,%s,'buy',1,10,10,'2026-10-01T23:00:05Z')",(late_fill,late_order,account,instrument))
        source.execute("UPDATE orders SET status='filled',price=10,reserved_cash=0,date_finalized='2026-10-01T23:00:05Z' WHERE order_id=%s",(late_order,))
    deliver(source,target)
    with target.transaction():
        apply_event(target,{'event_id':str(uuid4()),'record_type':'heartbeat','created_at':'2026-10-01T23:00:10Z',
            'payload':{'schema_version':1,'row':{}}})
    first=build_report(target,date(2026,10,1))
    second=build_report(target,date(2026,10,1))
    assert first!=second
    assert target.execute('SELECT count(*),sum(cash_amount) FROM analytics.published_trades').fetchone()==(1,Decimal('0.01'))
    assert period(date(2026,10,1))[1].hour==23
    assert period(date(2026,12,1))[1].hour==0  # EST: next UTC day, still 7 PM locally.
    try:
        build_report(target,date(2026,10,1),datetime(2026,10,1,22,tzinfo=timezone.utc))
        raise AssertionError('Published before cutoff')
    except ValueError: pass
    # Staff append a future schedule without rewriting the earlier report.
    target.execute('SET ROLE analytics_admin')
    schedule_id=uuid4()
    target.execute("INSERT INTO integration.report_schedules(schedule_id,effective_from,cutoff_local_time,changed_by) VALUES (%s,'2026-10-02','17:30',%s)",(schedule_id,uuid4()))
    try:
        target.execute("UPDATE integration.report_schedules SET cutoff_local_time='18:00' WHERE schedule_id=%s",(schedule_id,))
        raise AssertionError('Schedule history was mutable')
    except psycopg.Error: pass
    target.execute('SET ROLE analytics_etl')
    assert configured_time(target,date(2026,10,1))==time(19)
    assert configured_time(target,date(2026,10,2))==time(17,30)
    assert target.execute('SELECT cutoff_at FROM integration.report_batches WHERE batch_id=%s',(first,)).fetchone()[0].hour==23
    try:
        build_report(target,date(2026,10,2),datetime(2026,10,2,21,29,tzinfo=timezone.utc))
        raise AssertionError('Published before selected cutoff')
    except ValueError: pass
    with target.transaction():
        apply_event(target,{'event_id':str(uuid4()),'record_type':'heartbeat','created_at':'2026-10-02T21:31:00Z',
            'payload':{'schema_version':1,'row':{}}})
    configured_batch=build_report(target,date(2026,10,2),datetime(2026,10,2,21,31,tzinfo=timezone.utc))
    assert target.execute('SELECT cutoff_at FROM integration.report_batches WHERE batch_id=%s',(configured_batch,)).fetchone()[0].isoformat()=='2026-10-02T21:30:00+00:00'
    # Immutability is enforced in SQL even when code accidentally issues an update.
    try:
        target.execute('UPDATE audit.pricing_evidence SET reason=reason')
        raise AssertionError('Evidence was mutable')
    except psycopg.Error: pass
    print('Passed: transactional rollback, replay, attempt vs terminal rejection, exact cash, report reruns, cutoff and DST')
