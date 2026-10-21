"""CLI for the local deployment outbox publisher, Kafka consumer, backfill and nightly ETL."""
import argparse
import json
import logging
import os
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4, uuid5, NAMESPACE_URL

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import set_json_loads
from confluent_kafka import Producer, Consumer
from projection import apply_event
from reports import configured_time, period, build_report, process_report_requests, ZONE

logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
LOG=logging.getLogger('pipeline')
set_json_loads(lambda text:json.loads(text,parse_float=Decimal))
TOPIC=os.getenv('KAFKA_TOPIC','trading-audit-v1')


def connect(source=False):
    prefix='SOURCE' if source else 'REPORTING'
    return psycopg.connect(host=os.environ[prefix+'_DB_HOST'],port=os.getenv(prefix+'_DB_PORT','5432'),
        dbname=os.environ[prefix+'_DB_NAME'],user=os.environ[prefix+'_DB_USER'],
        password=os.environ[prefix+'_DB_PASSWORD'],autocommit=True,connect_timeout=10)


def producer():
    return Producer({'bootstrap.servers':os.getenv('KAFKA_BOOTSTRAP_SERVERS','kafka:9092'),
                     'enable.idempotence':True,'acks':'all','delivery.timeout.ms':30000})


def publish(kafka,event):
    errors=[]
    kafka.produce(TOPIC,key=str(event['aggregate_key']),value=json.dumps(event,default=str),
                  on_delivery=lambda error,message: errors.append(error) if error else None)
    remaining=kafka.flush(35)
    if remaining or errors:
        raise RuntimeError('Kafka did not acknowledge the event')


def backfill(source,kafka):
    """Consistent source snapshot; preserve only facts that actually exist."""
    tables=['users','accounts','instruments','orders','order_audit_events','order_pricing_evidence',
            'cash_ledger','staff_audit_events','holdings','instrument_marks']
    keys=['user_id','account_id','instrument_id','order_id','event_id','evidence_id','movement_id','audit_id','holding_id','symbol']
    with source.transaction():
        source.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        at=source.execute('SELECT clock_timestamp()').fetchone()[0]
        for table,key in zip(tables,keys):
            with source.cursor() as cur:
                cur.execute(sql.SQL('SELECT to_jsonb(t) FROM {} t').format(sql.Identifier(table)))
                for (row,) in cur.fetchall():
                    context={'schema_version':1,'operation':'SNAPSHOT','row':row}
                    order_id=row.get('order_id')
                    order_row=source.execute('SELECT to_jsonb(o) FROM orders o WHERE order_id=%s',(order_id,)).fetchone() if order_id else None
                    context['order']=order_row[0] if order_row else None
                    account_id=row.get('account_id') or (context['order'] or {}).get('account_id')
                    instrument_id=row.get('instrument_id') or (context['order'] or {}).get('instrument_id')
                    acc=source.execute("SELECT to_jsonb(a)||jsonb_build_object('email',u.email) FROM accounts a JOIN users u USING(user_id) WHERE account_id=%s",(account_id,)).fetchone() if account_id else None
                    ins=source.execute('SELECT to_jsonb(i) FROM instruments i WHERE instrument_id=%s',(instrument_id,)).fetchone() if instrument_id else None
                    context.update(account=acc[0] if acc else None,instrument=ins[0] if ins else None)
                    publish(kafka,dict(event_id=str(uuid5(NAMESPACE_URL,f'asset-avengers/snapshot/{table}/{row[key]}')),
                        aggregate_key=order_id or account_id or row[key],record_type=table,payload=context,created_at=at))
    LOG.info('Historical snapshot published; unavailable historical quotes/lifecycle steps were not invented')


def run_publisher(with_backfill=False):
    """Ship committed source rows; mark delivery only after the broker acknowledges.

    The advisory lease allows one local deployment publisher. A crash after Kafka accepts but
    before SQL commits can redeliver, so projection.py deduplicates event UUIDs.
    """
    with connect(True) as source:
        if not source.execute('SELECT pg_try_advisory_lock(721915)').fetchone()[0]:
            raise RuntimeError('Another publisher already holds the local deployment lease')
        kafka=producer()
        if with_backfill:
            backfill(source,kafka)
        last_heartbeat=0
        while True:
            with source.transaction():
                with source.cursor(row_factory=dict_row) as cur:
                    cur.execute('''SELECT event_id,aggregate_key,record_type,payload,created_at
                        FROM audit_outbox WHERE published_at IS NULL ORDER BY sequence_id LIMIT 100 FOR UPDATE''')
                    events=cur.fetchall()
                for event in events:
                    publish(kafka,event)
                    source.execute('UPDATE audit_outbox SET published_at=clock_timestamp() WHERE event_id=%s',(event['event_id'],))
            if not events and time.monotonic()-last_heartbeat > 10:
                at=source.execute('SELECT clock_timestamp()').fetchone()[0]
                publish(kafka,dict(event_id=str(uuid4()),aggregate_key='heartbeat',record_type='heartbeat',
                    payload={'schema_version':1,'operation':'HEARTBEAT','row':{}},created_at=at))
                last_heartbeat=time.monotonic()
            if not events:
                time.sleep(1)


def run_consumer():
    """Commit envelopes and their projections together before advancing Kafka.

    A failed SQL transaction leaves the offset uncommitted. Restart retries the
    message; silently skipping it would make financial reports incomplete.
    """
    kafka=Consumer({'bootstrap.servers':os.getenv('KAFKA_BOOTSTRAP_SERVERS','kafka:9092'),
        'group.id':'admin-analytics-v1','auto.offset.reset':'earliest','enable.auto.commit':False,
        'enable.auto.offset.store':False})
    kafka.subscribe([TOPIC])
    try:
        with connect() as target:
            while True:
                message=kafka.poll(1)
                if message is None:
                    continue
                if message.error():
                    raise RuntimeError('Kafka consumer error')
                event=json.loads(message.value(),parse_float=Decimal)
                with target.transaction():
                    apply_event(target,event)
                kafka.commit(message=message,asynchronous=False)
    finally:
        kafka.close()


def run_scheduler():
    """Publish today's report after the saved cutoff; retry while data is not ready.

    Earlier missed dates require the explicit report --date command. This process
    does not mutate client trading records or make provider quote requests.
    """
    while True:
        now=datetime.now(ZONE)
        try:
            with connect() as target:
                process_report_requests(target)
                _,cutoff=period(now.date(),configured_time(target,now.date()))
                if now.astimezone(timezone.utc) >= cutoff:
                    done=target.execute("SELECT 1 FROM integration.report_batches WHERE report_date=%s AND cutoff_at >= %s AND status='published'",(now.date(),cutoff)).fetchone()
                    if not done:
                        batch=build_report(target,now.date())
                        LOG.info('Published report for %s, batch %s',now.date(),batch)
        except Exception as error:
            LOG.warning('Report unavailable; retrying in 30 seconds (%s)',type(error).__name__)
        time.sleep(30)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['publisher','consumer','report','scheduler','backfill'])
    parser.add_argument('--backfill',action='store_true')
    parser.add_argument('--date',type=date.fromisoformat)
    args=parser.parse_args()
    if args.command=='publisher': run_publisher(args.backfill)
    elif args.command=='consumer': run_consumer()
    elif args.command=='scheduler': run_scheduler()
    elif args.command=='backfill':
        with connect(True) as source: backfill(source,producer())
    else:
        with connect() as target: print(build_report(target,args.date or datetime.now(ZONE).date()))


if __name__=='__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        # Do not put connection strings, financial payloads or credentials in logs.
        LOG.error('Pipeline stopped (%s). Uncommitted events will be retried.',type(error).__name__)
        raise SystemExit(1)
