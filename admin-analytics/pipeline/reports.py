"""Same-day reports with a persisted New York cutoff, atomically published."""
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo
from uuid import uuid4

ZONE = ZoneInfo('America/New_York')


def configured_time(connection, day):
    row = connection.execute('''SELECT cutoff_local_time FROM integration.report_schedules
        WHERE effective_from <= %s ORDER BY effective_from DESC,changed_at DESC,schedule_id DESC LIMIT 1''',(day,)).fetchone()
    return row[0] if row else time(19)


def period(day, cutoff_time=time(19)):
    """Build local calendar boundaries before converting to UTC, including DST."""
    return (datetime.combine(day,time.min,ZONE).astimezone(timezone.utc),
            datetime.combine(day,cutoff_time,ZONE).astimezone(timezone.utc))


def build_report(connection, day, now=None, cutoff_at=None):
    """Append a batch and publish only reconciled source cash/fill facts.

    The pointer selects one successful version per date. Failed replacements keep
    the previous report readable, and historical batches remain auditable.
    """
    now = now or datetime.now(timezone.utc)
    start, cutoff = period(day, configured_time(connection, day))
    if cutoff_at is not None:
        # Manual reports retain the request's exact cutoff, even across midnight.
        if cutoff_at.tzinfo is None or not start < cutoff_at or cutoff_at.astimezone(ZONE).date() != day:
            raise ValueError('Manual cutoff must belong to the requested New York day')
        cutoff = cutoff_at
    if now < cutoff:
        raise ValueError('The same-day report cannot be published before its configured New York cutoff')
    batch = uuid4()
    # Serialize scheduled/manual rebuilds; leave the previous published batch visible
    # if anything in the replacement fails. A successful rerun replaces the pointer.
    with connection.transaction():
        connection.execute('SELECT pg_advisory_xact_lock(721916)')
        heartbeat=connection.execute("SELECT source_heartbeat_at FROM integration.pipeline_status WHERE pipeline='trading'").fetchone()
        if not heartbeat or not heartbeat[0] or heartbeat[0] < cutoff:
            raise ValueError('Waiting for the consumer to receive a source heartbeat after the cutoff')
        connection.execute('''INSERT INTO integration.report_batches
            (batch_id,report_date,period_start,cutoff_at,status,source_heartbeat_at)
            VALUES (%s,%s,%s,%s,'running',%s)''',(batch,day,start,cutoff,heartbeat[0]))
    try:
        with connection.transaction():
            connection.execute('SELECT pg_advisory_xact_lock(721916)')
            connection.execute('''INSERT INTO analytics.trade_facts
                SELECT %s,c.change_id,%s,tr.client_id,tr.order_id,tr.instrument_id,tr.symbol,
                       i.security_type,tr.order_side,abs(c.holding_delta),e.price,abs(c.cash_delta),c.occurred_at
                FROM cash_holding_changes c
                JOIN trade_records tr ON tr.order_id=c.order_id
                LEFT JOIN instruments i ON i.instrument_id=tr.instrument_id
                JOIN LATERAL (SELECT price FROM trade_lifecycle_events
                    WHERE order_id=tr.order_id AND event_type='filled' ORDER BY event_at LIMIT 1) e ON TRUE
                WHERE c.change_type='trade' AND c.occurred_at >= %s AND c.occurred_at < %s''',
                (batch,day,start,cutoff))
            expected=connection.execute('''SELECT count(*),coalesce(sum(abs(cash_delta)),0)
                FROM cash_holding_changes WHERE change_type='trade' AND occurred_at >= %s AND occurred_at < %s''',
                (start,cutoff)).fetchone()
            actual=connection.execute('SELECT count(*),coalesce(sum(cash_amount),0) FROM analytics.trade_facts WHERE batch_id=%s',
                                      (batch,)).fetchone()
            if expected != actual:
                raise ValueError('Fill count/cash reconciliation failed; previous report remains published')
            connection.execute("UPDATE integration.report_batches SET status='published',completed_at=clock_timestamp() WHERE batch_id=%s",(batch,))
            connection.execute('''INSERT INTO integration.published_reports VALUES (%s,%s)
                ON CONFLICT(report_date) DO UPDATE SET batch_id=EXCLUDED.batch_id''',(day,batch))
    except Exception:
        with connection.transaction():
            connection.execute("UPDATE integration.report_batches SET status='failed',completed_at=clock_timestamp(),error='Report build or reconciliation failed' WHERE batch_id=%s",(batch,))
        raise
    return str(batch)


def process_report_requests(connection):
    """Process shared queued requests after ingestion catches up; retry after crashes."""
    if not connection.execute('SELECT pg_try_advisory_lock(721918)').fetchone()[0]:
        return
    try:
        requests = connection.execute("SELECT request_id,cutoff_at FROM integration.report_requests WHERE status='queued' ORDER BY cutoff_at LIMIT 10").fetchall()
        for request_id, cutoff in requests:
            heartbeat = connection.execute("SELECT source_heartbeat_at FROM integration.pipeline_status WHERE pipeline='trading'").fetchone()
            if not heartbeat or not heartbeat[0] or heartbeat[0] < cutoff:
                break
            try:
                batch = build_report(connection, cutoff.astimezone(ZONE).date(), cutoff_at=cutoff)
            except Exception:
                connection.execute("UPDATE integration.report_requests SET status='failed',completed_at=clock_timestamp(),error='Report generation failed; retry or contact an administrator' WHERE request_id=%s", (request_id,))
            else:
                connection.execute("UPDATE integration.report_requests SET status='published',completed_at=clock_timestamp(),batch_id=%s WHERE request_id=%s", (batch,request_id))
    finally:
        connection.execute('SELECT pg_advisory_unlock(721918)')
