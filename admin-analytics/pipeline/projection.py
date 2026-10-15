"""Transactional, idempotent projection of the version-1 trading outbox."""
import json
from decimal import Decimal
from psycopg.types.json import Jsonb

RECORDS = {'users', 'accounts', 'instruments', 'holdings', 'orders', 'trade_fills',
           'transactions', 'order_audit_events', 'order_pricing_evidence',
           'cash_ledger', 'staff_audit_events', 'heartbeat'}


def json_value(value):
    return Jsonb(value, dumps=lambda item: json.dumps(item, default=str))


def account(cur, row, source_time):
    if not row:
        return
    cur.execute('''INSERT INTO client_accounts(account_id,client_id,email,cash_balance,is_suspended,source_updated_at)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(account_id) DO UPDATE SET
        email=coalesce(EXCLUDED.email,client_accounts.email),cash_balance=EXCLUDED.cash_balance,
        is_suspended=EXCLUDED.is_suspended,source_updated_at=EXCLUDED.source_updated_at,loaded_at=clock_timestamp()
        WHERE EXCLUDED.source_updated_at >= client_accounts.source_updated_at''',
        (row['account_id'], row['user_id'], row.get('email'), row['cash_balance'],
         row['is_suspended'], row.get('updated_at') or source_time))


def instrument(cur, row, source_time):
    if not row:
        return
    cur.execute('''INSERT INTO instruments(instrument_id,symbol,name,security_type,is_tradable,source_updated_at)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(instrument_id) DO UPDATE SET
        symbol=EXCLUDED.symbol,name=EXCLUDED.name,security_type=EXCLUDED.security_type,
        is_tradable=EXCLUDED.is_tradable,source_updated_at=EXCLUDED.source_updated_at,loaded_at=clock_timestamp()
        WHERE EXCLUDED.source_updated_at >= instruments.source_updated_at''',
        (row['instrument_id'], row['symbol'], row.get('name'), row.get('security_type'),
         row['is_active'], row.get('updated_at') or source_time))


def order(cur, row, source_time):
    if not row:
        return
    cur.execute('''INSERT INTO trade_records(order_id,client_id,account_id,instrument_id,symbol,
        order_side,order_type,quantity,limit_price,stop_price,placed_at)
        SELECT %s,ca.client_id,ca.account_id,%s,i.symbol,%s,%s,%s,%s,%s,%s
        FROM client_accounts ca CROSS JOIN instruments i
        WHERE ca.account_id=%s AND i.instrument_id=%s ON CONFLICT DO NOTHING''',
        (row['order_id'], row['instrument_id'], row['order_side'], row['order_type'], row['quantity'],
         row.get('limit_price'), row.get('stop_price'), row['date_placed'],row['account_id'],row['instrument_id']))
    cur.execute('''INSERT INTO audit.order_state VALUES (%s,%s,%s)
        ON CONFLICT(order_id) DO UPDATE SET status=EXCLUDED.status,source_updated_at=EXCLUDED.source_updated_at
        WHERE EXCLUDED.source_updated_at >= audit.order_state.source_updated_at''',
        (row['order_id'],row['status'],row.get('updated_at') or source_time))


def apply_event(connection, event):
    """Project one allowed source envelope into the staff reporting store.

    Caller owns the transaction: deduplication and every derived row must commit
    together. Stable source IDs protect financial facts; timestamps protect mutable
    mirrors. Bank credentials are absent from the source extraction allowlist.
    """
    kind=event['record_type']
    payload=event['payload']
    if kind not in RECORDS or payload.get('schema_version') != 1:
        raise ValueError('Unsupported event type or schema version')
    row=payload['row']
    at=event['created_at']
    with connection.cursor() as cur:
        cur.execute('''INSERT INTO audit.ingested_events(event_id,record_type,payload,source_created_at)
            VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING event_id''',
            (event['event_id'],kind,json_value(payload),at))
        if cur.fetchone() is None:
            return False
        account(cur,payload.get('account'),at)
        instrument(cur,payload.get('instrument'),at)
        order(cur,payload.get('order'),at)
        if kind == 'accounts':
            account(cur,{**row,'email':(payload.get('account') or {}).get('email')},at)
        elif kind == 'instruments':
            instrument(cur,row,at)
        elif kind == 'users':
            cur.execute('UPDATE client_accounts SET email=%s WHERE client_id=%s',(row.get('email'),row['user_id']))
        elif kind == 'holdings':
            cur.execute('''INSERT INTO client_positions(account_id,instrument_id,quantity,source_updated_at)
                VALUES (%s,%s,%s,%s) ON CONFLICT(account_id,instrument_id) DO UPDATE SET
                quantity=EXCLUDED.quantity,source_updated_at=EXCLUDED.source_updated_at,loaded_at=clock_timestamp()
                WHERE EXCLUDED.source_updated_at >= client_positions.source_updated_at''',
                (row['account_id'],row['instrument_id'],row['quantity'],row.get('updated_at') or at))
        elif kind == 'orders':
            order(cur,row,at)
            # Historical imports expose only the known state, explicitly labelled.
            if payload.get('operation') == 'SNAPSHOT':
                status=row['status']
                if status in ('filled','rejected','cancelled','submitted','accepted'):
                    cur.execute('''INSERT INTO trade_lifecycle_events(event_id,order_id,event_type,event_at,
                        quantity,price,rejection_reason,terminal,provenance)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'snapshot') ON CONFLICT DO NOTHING''',
                        (event['event_id'],row['order_id'],status,
                         row.get('date_finalized') or row.get('updated_at') or row['date_placed'],
                         row['quantity'],row.get('price'),row.get('rejection_reason'),
                         status in ('filled','rejected','cancelled')))
        elif kind == 'order_audit_events':
            cur.execute('''INSERT INTO trade_lifecycle_events(event_id,order_id,event_type,event_at,
                quantity,price,rejection_reason,terminal) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING''',
                (row['event_id'],row['order_id'],row['event_type'],row['event_at'],row.get('quantity'),
                 row.get('price'),row.get('reason'),row['terminal']))
        elif kind == 'order_pricing_evidence':
            quote=json.loads(row['quote_json'],parse_float=Decimal) if row.get('quote_json') else None
            cur.execute('''INSERT INTO audit.pricing_evidence VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING''', (row['evidence_id'],row['order_id'],row['phase'],row['decision'],
                row.get('reason'),json_value(quote) if quote else None,row['observed_at']))
            if row['decision'] == 'rejected':
                cur.execute('''INSERT INTO trade_lifecycle_events(event_id,order_id,event_type,event_at,
                    rejection_reason,terminal) VALUES (%s,%s,'rejected',%s,%s,FALSE) ON CONFLICT DO NOTHING''',
                    (row['evidence_id'],row['order_id'],row['observed_at'],row['reason']))
        elif kind == 'cash_ledger':
            cur.execute('''INSERT INTO cash_holding_changes(change_id,order_id,client_id,account_id,
                instrument_id,change_type,cash_delta,holding_delta,occurred_at)
                SELECT %s,%s,client_id,account_id,%s,%s,%s,%s,%s FROM client_accounts WHERE account_id=%s
                ON CONFLICT DO NOTHING''', (row['movement_id'],row.get('order_id'),row.get('instrument_id'),
                row['movement_type'],row['cash_delta'],row['holding_delta'],row['occurred_at'],row['account_id']))
            if cur.rowcount == 0:
                cur.execute('SELECT 1 FROM cash_holding_changes WHERE change_id=%s',(row['movement_id'],))
                if cur.fetchone() is None:
                    raise ValueError('Missing account for ledger event')
        elif kind == 'staff_audit_events':
            cur.execute('''INSERT INTO admin_audit_log(audit_id,actor_id,actor_email,action,target_account_id,
                target_instrument_id,target_order_id,reason,occurred_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING''', tuple(row.get(key) for key in ('audit_id','actor_id','actor_email','action',
                'target_account_id','target_instrument_id','target_order_id','reason','occurred_at')))
        cur.execute('''INSERT INTO integration.pipeline_status(pipeline,source_heartbeat_at,last_event_id)
            VALUES ('trading',%s,%s) ON CONFLICT(pipeline) DO UPDATE SET
            source_heartbeat_at=coalesce(EXCLUDED.source_heartbeat_at,integration.pipeline_status.source_heartbeat_at),
            received_at=clock_timestamp(),last_event_id=EXCLUDED.last_event_id''',
            (at if kind=='heartbeat' else None,event['event_id']))
    return True
