"""Opt-in Docker integration check: python3 scripts/tests/verify_ci_isolation.py.

Creates two disposable CI database projects; never starts or stops development.
Uses temporary test credentials rather than the developer's root .env.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / 'scripts/ci-compose.sh'


def run(args, env=None):
    return subprocess.check_output(args, cwd=ROOT, env=env, text=True).strip()


def main():
    projects = []
    with tempfile.TemporaryDirectory(prefix='endgame-ci-test-') as directory:
        fixture = Path(directory) / '.env'
        fixture.write_text('\n'.join([
            'DB_USERNAME=ci_test', 'POSTGRES_DB=ci_test',
            'DB_PASSWORD=' + secrets.token_hex(24),
            'AUTH_DB_PASSWORD=' + secrets.token_hex(24),
            'JWT_SECRET=' + secrets.token_hex(32),
            'FAUXNANCE_PRICING_API_KEY=unused-isolation-test',
        ]) + '\n')
        fixture.chmod(0o600)

        def compose(env, *args):
            return run(['bash', str(HELPER), *args], env)

        try:
            for _ in range(2):
                name = run(['bash', str(HELPER), 'new-project'])
                env = dict(os.environ, CI_PROJECT_NAME=name, CI_ENV_FILE=str(fixture))
                compose(env, 'init')
                projects.append(env)
                compose(env, 'up', '-d', 'postgres', 'auth-db')
            ids = []
            for env in projects:
                containers = {}
                for service in ('postgres', 'auth-db'):
                    container = compose(env, 'ps', '-q', service)
                    containers[service] = container
                    detail = json.loads(run(['docker', 'inspect', container]))[0]
                    assert detail['Config']['Labels']['com.docker.compose.project'] == env['CI_PROJECT_NAME']
                    assert all(n.startswith(env['CI_PROJECT_NAME'] + '_') for n in detail['NetworkSettings']['Networks'])
                    assert not any(detail['HostConfig']['PortBindings'].values()), 'Published host ports found'
                    for mount in detail['Mounts']:
                        if mount['Type'] == 'volume':
                            assert mount['Name'].startswith(env['CI_PROJECT_NAME'] + '_')
                        else:
                            assert mount['Type'] == 'bind' and not mount['RW']
                    # Health includes completion of schema/seed initialization.
                    for attempt in range(90):
                        state = json.loads(run(['docker', 'inspect', container]))[0]['State']
                        if state.get('Health', {}).get('Status') == 'healthy':
                            break
                        if not state['Running']:
                            raise RuntimeError(f'{service} stopped during initialization')
                        time.sleep(1)
                    else:
                        raise RuntimeError(f'{service} did not become healthy')
                ids.append(containers)
            sql = 'CREATE TABLE ci_isolation_probe (value text); INSERT INTO ci_isolation_probe VALUES (\'preserved\');'
            compose(projects[1], 'exec', '-T', 'postgres', 'psql', '-U', 'ci_test', '-d', 'ci_test', '-v', 'ON_ERROR_STOP=1', '-c', sql)
            compose(projects[0], 'cleanup')
            for kind, args in (
                ('containers', ['docker', 'ps', '-aq']),
                ('networks', ['docker', 'network', 'ls', '-q']),
                ('volumes', ['docker', 'volume', 'ls', '-q']),
            ):
                assert not run(args + ['--filter', 'label=com.docker.compose.project=' + projects[0]['CI_PROJECT_NAME']]), f'First project left {kind}'
            for service, container in ids[1].items():
                assert compose(projects[1], 'ps', '-q', service) == container
                assert run(['docker', 'inspect', '-f', '{{.State.Running}}', container]) == 'true'
            value = compose(projects[1], 'exec', '-T', 'postgres', 'psql', '-U', 'ci_test', '-d', 'ci_test', '-Atc', 'SELECT value FROM ci_isolation_probe')
            assert value == 'preserved'
            print('PASS: unique containers, networks and volumes; no host ports; cleanup A preserved B and its data.')
        finally:
            # Only receipts created by this run authorize teardown. Never prune Docker.
            for env in reversed(projects):
                receipt = ROOT / '.ci' / (env['CI_PROJECT_NAME'] + '.initialized')
                if receipt.exists():
                    compose(env, 'cleanup')


if __name__ == '__main__':
    main()
