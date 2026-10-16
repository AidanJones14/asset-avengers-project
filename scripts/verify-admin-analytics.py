#!/usr/bin/env python3
"""Verify the audit pipeline in disposable databases; leave live application rows untouched."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import uuid

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('verifier',ROOT/'scripts/verify-db-schemas.py')
verifier=importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

if __name__=='__main__':
    container='endgame_postgres'
    suffix=uuid.uuid4().hex[:12]
    source='asset_audit_source_'+suffix
    target='asset_audit_target_'+suffix
    configuration=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .Config.Env}}',container],text=True))
    configuration=dict(item.split('=',1) for item in configuration if '=' in item)
    env=os.environ.copy()
    env['PIPELINE_TEST_USER']=configuration['POSTGRES_USER']
    env['PIPELINE_TEST_PASSWORD']=configuration['POSTGRES_PASSWORD']
    created=[]
    try:
        for database,file in [(source,'endgame_db.schema.sql'),(target,'admin_analytics_db.schema.sql')]:
            verifier.psql(container,'postgres','CREATE DATABASE "'+database+'";')
            created.append(database)
            schema=(ROOT/'DB'/file).read_text()
            verifier.psql(container,database,schema)
            verifier.psql(container,database,schema)
        command=['docker','run','--rm','--network','trading_platform_network',
            '--env','PIPELINE_TEST_USER','--env','PIPELINE_TEST_PASSWORD',
            '--env','PIPELINE_SOURCE_DB='+source,'--env','PIPELINE_TARGET_DB='+target,
            '--mount',f'type=bind,src={ROOT},dst=/workspace,readonly',
            '--entrypoint','python','asset-analytics-pipeline:local',
            '/workspace/admin-analytics/pipeline/tests/integration.py']
        subprocess.run(command,env=env,check=True)
        print('Audit schema, idempotent projection, cash reconciliation and reporting cutoff: passed')
    finally:
        for database in created:
            verifier.psql(container,'postgres','DROP DATABASE "'+database+'" WITH (FORCE);')
