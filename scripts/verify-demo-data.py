#!/usr/bin/env python3
"""Verify demo fixtures in an isolated PostgreSQL container; never touch app data."""
import importlib.util
import os
from pathlib import Path
import secrets
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('verifier',ROOT/'scripts/verify-db-schemas.py')
verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)

def main():
    name='asset-demo-verify-'+secrets.token_hex(5)
    network=name+'-network'
    password=secrets.token_hex(24)
    env=os.environ.copy();env['POSTGRES_PASSWORD']=password
    created=False
    try:
        subprocess.run(['docker','network','create',network],check=True,stdout=subprocess.DEVNULL)
        subprocess.run(['docker','run','-d','--rm','--name',name,'--network',network,'--network-alias','postgres',
            '--env','POSTGRES_PASSWORD','--env','POSTGRES_USER=postgres','postgres:18.6-trixie'],env=env,check=True,stdout=subprocess.DEVNULL)
        created=True
        for _ in range(60):
            if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('Disposable PostgreSQL did not start')
        def sql(db,value):return verifier.psql(name,db,value)
        for db,file in [('demo_auth','auth_db.schema.sql'),('demo_source','endgame_db.schema.sql'),('demo_target','admin_analytics_db.schema.sql')]:
            sql('postgres','CREATE DATABASE '+db)
            sql(db,(ROOT/'DB'/file).read_text())
        sql('postgres',"CREATE ROLE demo_worker LOGIN PASSWORD '"+password+"' IN ROLE analytics_etl")
        def load():
            for db,file in [('demo_auth','auth_db_test_data.sql'),('demo_auth','demo/auth.sql'),('demo_source','instruments.seed.sql'),('demo_source','demo/trading.sql'),('demo_auth','demo/expanded-auth.sql'),('demo_source','demo/expanded-trading.sql'),('demo_auth','demo/presentation-auth.sql'),('demo_source','demo/presentation-trading.sql')]:
                sql(db,'BEGIN;\n'+(ROOT/'DB'/file).read_text()+'\nCOMMIT;')
        load()
        assert sql('demo_source','SELECT count(*) FROM orders')=='2539'
        assert sql('demo_source','SELECT count(*) FROM trade_fills')=='2526'
        initial_cash=sql('demo_source','SELECT sum(cash_balance) FROM accounts')
        assert sql('demo_source','SELECT sum(cash_delta) FROM cash_ledger')==initial_cash
        assert sql('demo_source',"SELECT count(*) FROM client_disputes")=="12"
        assert sql('demo_source',"SELECT count(*) FROM orders WHERE status IN ('accepted','submitted')")=="0"
        assert sql('demo_source',"SELECT count(*) FROM trade_fills WHERE quantity<>trunc(quantity)")=="2040"
        assert sql('demo_source','SELECT count(*) FROM bank_accounts')=='99'
        assert sql('demo_source','SELECT count(*) FROM accounts')=='100'
        assert sql('demo_source','SELECT count(*) FROM watchlist_items')=='975'
        assert sql('demo_source',"SELECT quantity FROM holdings JOIN instruments USING(instrument_id) WHERE account_id='de200000-0000-0000-0000-000000000001' AND symbol='AAPL'")=='12.0000'
        # A later user deposit survives a rerun; seed history never duplicates.
        sql('demo_source',"BEGIN; UPDATE accounts SET cash_balance=cash_balance+1 WHERE account_id='de200000-0000-0000-0000-000000000001'; INSERT INTO transactions(account_id,txn_type,amount) VALUES('de200000-0000-0000-0000-000000000001','deposit',1); COMMIT;")
        after=sql('demo_source','SELECT count(*) FROM audit_outbox')
        financial_fingerprint=sql('demo_source',"SELECT md5(string_agg(row_to_json(t)::text,',' ORDER BY account_id)) FROM accounts t")
        load()
        assert sql('demo_source','SELECT count(*) FROM audit_outbox')==after
        assert sql('demo_source',"SELECT md5(string_agg(row_to_json(t)::text,',' ORDER BY account_id)) FROM accounts t")==financial_fingerprint
        from decimal import Decimal
        assert Decimal(sql('demo_source','SELECT sum(cash_balance) FROM accounts'))==Decimal(initial_cash)+1
        assert sql('demo_source','SELECT sum(cash_balance) FROM accounts')==sql('demo_source','SELECT sum(cash_delta) FROM cash_ledger')
        print('Demo SQL: balances, holdings, ledger, orders, banks, stars and safe reruns passed',flush=True)
        env.update(PIPELINE_TEST_PASSWORD=password,PIPELINE_TEST_USER='postgres',REPORTING_DB_HOST='postgres',
            REPORTING_DB_NAME='demo_target',REPORTING_DB_USER='demo_worker',REPORTING_DB_PASSWORD=password)
        command=['docker','run','--rm','--network',network,'--workdir','/workspace/admin-analytics/pipeline']
        for key in ['PIPELINE_TEST_PASSWORD','PIPELINE_TEST_USER','REPORTING_DB_HOST','REPORTING_DB_NAME','REPORTING_DB_USER','REPORTING_DB_PASSWORD']:command+=['--env',key]
        command+=['--mount',f'type=bind,src={ROOT},dst=/workspace,readonly','--entrypoint','python','asset-analytics-pipeline:local','/workspace/admin-analytics/pipeline/tests/demo.py']
        subprocess.run(command,env=env,check=True)
    finally:
        if created:subprocess.run(['docker','rm','-f','-v',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['docker','network','rm',network],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

if __name__=='__main__':main()
