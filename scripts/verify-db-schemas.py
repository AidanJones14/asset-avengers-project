#!/usr/bin/env python3
"""Verify SQL schemas/seeds in temporary PostgreSQL databases; never reset app data."""
import argparse
import json
from pathlib import Path
import subprocess
import uuid
from instrument_seed import read_seed

ROOT = Path(__file__).resolve().parents[1]

def psql(container, database, sql):
    command = 'psql -X -v ON_ERROR_STOP=1 -q -A -t -U "$POSTGRES_USER" -d "$1"'
    result = subprocess.run(['docker', 'exec', '-i', container, 'sh', '-c', command, 'verify', database],
                            input=sql, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()

CONSTRAINT_SQL = """SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.table_name,c.definition),'[]'::json)
FROM (SELECT r.relname AS table_name,con.contype AS type,pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class r ON r.oid=con.conrelid
JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public') c;"""

COLUMN_SQL = """SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.table_name,c.ordinal_position),'[]'::json)
FROM (SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default,
      character_maximum_length,numeric_precision,numeric_scale
      FROM information_schema.columns WHERE table_schema='public') c;"""

def check_fixture(container, kind, schema_file, seed_file):
    database = 'asset_schema_verify_' + kind + '_' + uuid.uuid4().hex[:12]
    psql(container, 'postgres', 'CREATE DATABASE "' + database + '";')
    try:
        schema = schema_file.read_text()
        psql(container, database, schema)
        psql(container, database, schema)
        if seed_file:
            seed = seed_file.read_text()
            psql(container, database, seed)
            psql(container, database, seed)
        if kind == 'endgame':
            counts = psql(container, database, "SELECT json_build_object('instruments',(SELECT count(*) FROM instruments),"
                "'users',(SELECT count(*) FROM users),'accounts',(SELECT count(*) FROM accounts),"
                "'holdings',(SELECT count(*) FROM holdings),'orders',(SELECT count(*) FROM orders),"
                "'banks',(SELECT count(*) FROM bank_accounts),'stars',(SELECT count(*) FROM watchlist_items));")
            values = json.loads(counts)
            expected_count = len(read_seed()[1])
            assert values['instruments'] == expected_count, values
            assert all(value == 0 for key,value in values.items() if key != 'instruments'), values
            print(f'endgame: schema/seed reruns passed; {expected_count} instruments, empty user portfolios')
        elif kind == 'auth':
            counts = json.loads(psql(container, database,
                "SELECT json_build_object('users',(SELECT count(*) FROM users),'sessions',(SELECT count(*) FROM sessions),"
                "'refresh_tokens',(SELECT count(*) FROM refresh_tokens),"
                "'superset_sso_grants',(SELECT count(*) FROM superset_sso_grants),'user_mfa',(SELECT count(*) FROM user_mfa),'mfa_challenges',(SELECT count(*) FROM mfa_challenges),"
                "'mfa_recovery_codes',(SELECT count(*) FROM mfa_recovery_codes),"
                "'password_reset_requests',(SELECT count(*) FROM password_reset_requests),"
                "'auth_email_outbox',(SELECT count(*) FROM auth_email_outbox));"))
            # 5 demo logins + super.admin + 3 dev.* accounts (DEV_MFA_BYPASS). The dev accounts'
            # user_mfa rows are locked and have no secret; when the switch is removed: 6 users, 0 user_mfa.
            assert counts == {'users':9, 'sessions':0, 'refresh_tokens':0, 'superset_sso_grants':0, 'user_mfa':3, 'mfa_challenges':0, 'mfa_recovery_codes':0, 'password_reset_requests':0, 'auth_email_outbox':0}, counts
            assert psql(container, database, 'SELECT count(secret_ciphertext) FROM user_mfa;') == '0'
            print('auth: schema/seed reruns passed; 9 development credentials, no sessions or enrolled MFA secrets')
        else:
            # Boundary and incomplete-price checks use only the disposable fixture DB.
            portfolio_fixture = (ROOT / 'DB/tests/portfolio-classes.sql').read_text()
            psql(container, database, 'BEGIN;\n' + portfolio_fixture + '\nROLLBACK;')
            account_fixture = (ROOT / 'DB/tests/investment-accounts.sql').read_text()
            psql(container, database, 'BEGIN;\n' + account_fixture + '\nROLLBACK;')
            print('admin/analytics: schema reruns and portfolio classification/account publication checks passed')
        return {"columns":json.loads(psql(container, database, COLUMN_SQL)),
                "constraints":json.loads(psql(container, database, CONSTRAINT_SQL))}
    finally:
        psql(container, 'postgres', 'DROP DATABASE "' + database + '" WITH (FORCE);')

def compare(container, database, expected, label):
    actual = json.loads(psql(container, database, COLUMN_SQL))
    by_key = lambda rows: {(row['table_name'],row['column_name']):row for row in rows}
    source, live = by_key(expected["columns"]), by_key(actual)
    diffs = []
    for key,row in source.items():
        if key not in live:
            diffs.append('.'.join(key) + ': missing')
        elif row != live[key]:
            diffs.append('.'.join(key) + ': definition differs')
    unexpected = sorted(set(live)-set(source))
    diffs += ['.'.join(key) + ': extra live column' for key in unexpected]
    canonical_constraints = {json.dumps(row,sort_keys=True) for row in expected["constraints"]}
    live_constraints = {json.dumps(row,sort_keys=True) for row in json.loads(psql(container,database,CONSTRAINT_SQL))}
    for row in sorted(canonical_constraints-live_constraints):
        item = json.loads(row)
        diffs.append(item['table_name'] + ': missing constraint ' + item['definition'])
    for row in sorted(live_constraints-canonical_constraints):
        item = json.loads(row)
        diffs.append(item['table_name'] + ': extra constraint ' + item['definition'])
    if diffs:
        print(label + ': live differences\n  ' + '\n  '.join(diffs))
        return False
    print(label + ': live columns, defaults and constraints match the schema')
    return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', default='endgame_postgres')
    parser.add_argument('--check-live', action='store_true')
    parser.add_argument('--trading-db', default='endgame_test')
    parser.add_argument('--auth-container', default='endgame_auth_db')
    parser.add_argument('--auth-db', default='auth')
    args = parser.parse_args()
    endgame = check_fixture(args.container,'endgame',ROOT/'DB/endgame_db.schema.sql',ROOT/'DB/endgame_db_test_data.sql')
    auth = check_fixture(args.container,'auth',ROOT/'DB/auth_db.schema.sql',ROOT/'DB/auth_db_test_data.sql')
    check_fixture(args.container,'analytics',ROOT/'DB/admin_analytics_db.schema.sql',None)
    if args.check_live:
        good = compare(args.container,args.trading_db,endgame,'endgame')
        good = compare(args.auth_container,args.auth_db,auth,'auth') and good
        raise SystemExit(0 if good else 1)
