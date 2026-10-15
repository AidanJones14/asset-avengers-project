#!/usr/bin/env python3
"""Start a disposable staff stack, run end-to-end assertions, then remove only it.

Requires the four locally built :poc images. Build internal-backend directly
from its folder; it does not require the client backend (see the setup guide).
The test-runtime.Dockerfile remains an optional shortcut for a locally tested jar.
"""
import os
import argparse
import json
import secrets
import subprocess
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
project='asset-internal-verify-'+secrets.token_hex(4)
values={key:secrets.token_hex(24) for key in ['DB_PASSWORD','JWT_SECRET','ADMIN_DB_SUPERUSER_PASSWORD',
    'ADMIN_DB_PASSWORD','ETL_DB_PASSWORD','SUPERSET_SECRET_KEY','SUPERSET_GUEST_TOKEN_SECRET',
    'SUPERSET_METADATA_PASSWORD','SUPERSET_REPORTING_PASSWORD','SUPERSET_ADMIN_PASSWORD','SUPERSET_SERVICE_PASSWORD']}
values.update(DB_USERNAME='audit_test',POSTGRES_DB='audit_test',TRADING_NETWORK=project+'-trading',
    ADMIN_DB_NAME='admin_analytics',ADMIN_DB_SUPERUSER='postgres',ADMIN_DB_USERNAME='endgame_admin',
    ETL_DB_USERNAME='analytics_worker',SUPERSET_METADATA_USER='superset_metadata',SUPERSET_METADATA_DB='superset_metadata',
    SUPERSET_REPORTING_USER='superset_reader',SUPERSET_ADMIN_USER='dashboard-author',SUPERSET_SERVICE_USER='internal-api',
    SUPERSET_EMBED_ORIGINS='http://localhost:8086,http://localhost:5174,http://localhost:8084,http://localhost:4200')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser',action='store_true',help='Also run Chromium against the real staff UI and embedded dashboard')
    args=parser.parse_args()
    with tempfile.NamedTemporaryFile(mode='w',prefix='asset-internal-',suffix='.env') as env_file:
        env_file.write(''.join(key+'='+value+'\n' for key,value in values.items()));env_file.flush()
        command=['docker','compose','--project-name',project,'--env-file',env_file.name,
                 '-f',str(ROOT/'docker/admin-analytics/admin-analyst-stack.compose.yml'),'-f',str(ROOT/'docker/admin-analytics/admin-analyst-tests.override.yml')]
        try:
            subprocess.run(command+['up','-d','--no-build','--wait','--wait-timeout','300'],check=True)
            # The test script runs on the internal network, accessing real HTTP and
            # Kafka services. Its inputs are ephemeral credentials, never live .env.
            cid=subprocess.check_output(command+['ps','-q','consumer'],text=True).strip()
            container_env=os.environ.copy()
            container_env['TEST_JWT_SECRET']=values['JWT_SECRET']
            container_env['TEST_DB_PASSWORD']=values['ADMIN_DB_SUPERUSER_PASSWORD']
            container_env['TEST_SOURCE_PASSWORD']=values['DB_PASSWORD']
            source_cid=subprocess.check_output(command+['ps','-q','source-db'],text=True).strip()
            # Seed a source order through SQL; existing Java tests separately verify
            # actual order execution against the same schema.
            seed=(ROOT/'admin-analytics/pipeline/tests/stack-seed.sql').read_text()
            subprocess.run(['docker','exec','-i',source_cid,'psql','-v','ON_ERROR_STOP=1','-U','audit_test','-d','audit_test'],input=seed,text=True,check=True)
            subprocess.run(['docker','exec','-i',cid,'python','-c',
                "import os,sys; exec(sys.stdin.read())"],input=(ROOT/'admin-analytics/pipeline/tests/stack-check.py').read_text(),
                text=True,check=True,env=container_env)
            # HTTP assertions need credentials inside the process environment.
            subprocess.run(['docker','exec','-i','--env','TEST_JWT_SECRET','--env','TEST_DB_PASSWORD',cid,'python','-'],
                input=(ROOT/'admin-analytics/pipeline/tests/http-check.py').read_text(),text=True,check=True,env=container_env)
            if args.browser:
                # Host-side browser requests are routed to these temporary bridge
                # addresses; the test keeps the configured localhost iframe origins.
                for service,key in [('internal-frontend','TEST_UI_TARGET'),('superset','TEST_SUPERSET_TARGET')]:
                    service_id=subprocess.check_output(command+['ps','-q',service],text=True).strip()
                    networks=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .NetworkSettings.Networks}}',service_id],text=True))
                    address=next(network['IPAddress'] for network in networks.values() if network['IPAddress'])
                    container_env[key]='http://'+address+(':8088' if service=='superset' else '')
                subprocess.run(['node',str(ROOT/'internal-frontend/tests/live-stack.mjs')],cwd=ROOT,env=container_env,check=True)
            print('Passed: Kafka ingestion, dashboard initialization, staff API authorization and Superset guest tokens')
        except Exception:
            # Application logs omit credential values; retain them in a local log
            # for diagnosing initialization failures without dumping env/config.
            path=Path(tempfile.gettempdir())/(project+'.log')
            with path.open('w') as log:
                subprocess.run(command+['logs','--no-color','--tail','100'],stdout=log,stderr=subprocess.STDOUT)
            print('Verification logs: '+str(path))
            raise
        finally:
            subprocess.run(command+['down','--volumes','--remove-orphans'],check=False)
