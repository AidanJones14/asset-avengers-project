"""Execute the production check scripts against controlled failing tools."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class RequiredCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        shutil.copy(ROOT / 'scripts/ci-checks.sh', self.root / 'scripts')
        for report in ('backend/target/site/jacoco/jacoco.xml', 'internal-backend/target/site/jacoco/jacoco.xml',
                       'auth-server/coverage/lcov.info', 'frontend/coverage/frontend/lcov.info',
                       'internal-frontend/coverage/staff/lcov.info'):
            path = self.root / report
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('test coverage fixture')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.calls = self.root / 'calls'
        self.env = dict(os.environ, PATH=str(self.bin) + ':' + os.environ['PATH'],
                        CALLS=str(self.calls), TOOL_EXIT='0', SONAR_TOKEN='test-token')
        self.tool('docker', '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
with open(os.environ['CALLS'], 'a') as f: f.write(json.dumps(sys.argv[1:]) + '\\n')
if 'inspect' in sys.argv:
    if '.State.Status' in ' '.join(sys.argv):
        print(os.environ.get('CONTAINER_STATE', 'running'))
    elif os.environ.get('STARTING_ONCE') and not Path(os.environ['STARTING_ONCE']).exists():
        Path(os.environ['STARTING_ONCE']).touch()
        print('starting')
    else:
        print(os.environ.get('HEALTH_STATE', 'healthy'))
else:
    print('tool diagnostic', flush=True)
sys.exit(int(os.environ['TOOL_EXIT']))
''')
        self.tool('sleep', '#!/usr/bin/env bash\necho retry-sleep >> "$CALLS"\n')
        # Service command fails at startup; subsequent status calls must never run.
        (self.root / 'scripts/ci-compose.sh').write_text('''#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$CALLS"
if [[ "${1:-}" == exec && "${HTTP_FAIL:-0}" == 1 ]]; then exit 1; fi
echo 'compose diagnostic'
exit "$TOOL_EXIT"
''')

    def tool(self, name, content):
        path = self.bin / name
        path.write_text(content)
        path.chmod(0o755)

    def check(self, action, code):
        self.env['TOOL_EXIT'] = str(code)
        return subprocess.run(['bash', str(self.root / 'scripts/ci-checks.sh'), action],
                              env=self.env, text=True, capture_output=True)

    def test_required_failures_keep_logs_and_nonzero_exit(self):
        for action, logfile in [('secrets', 'gitleaks-output.txt'),
                                ('services', 'services-output.txt'),
                                ('sonar', 'sonar-output.txt')]:
            with self.subTest(action=action):
                self.calls.unlink(missing_ok=True)
                result = self.check(action, 17)
                self.assertEqual(result.returncode, 17, result.stderr)
                self.assertIn('diagnostic', (self.root / logfile).read_text())
                self.assertEqual(len(self.calls.read_text().splitlines()), 1)

    def test_passing_checks_succeed(self):
        for action in ('secrets', 'services', 'sonar'):
            self.assertEqual(self.check(action, 0).returncode, 0)

    def test_readiness_checks_database_auth_backend_and_client(self):
        result = self.check('ready', 0)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls.read_text()
        self.assertIn('postgres', calls)
        self.assertIn('auth-db', calls)
        self.assertIn('auth-server', calls)
        self.assertIn('/actuator/health/readiness', calls)
        self.assertIn('/index.html', calls)
        self.assertIn('Client HTML through Nginx is ready', result.stdout)
        self.assertNotIn('retry-sleep', calls)

    def test_starting_database_retries_then_proceeds(self):
        self.env['STARTING_ONCE'] = str(self.root / 'health-started')
        result = self.check('database', 0)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('retry-sleep', self.calls.read_text())
        self.assertIn('postgres is healthy', result.stdout)

    def test_stopped_containers_fail_without_waiting(self):
        self.env['CONTAINER_STATE'] = 'exited'
        result = self.check('ready', 0)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not running', result.stdout)
        self.assertNotIn('/index.html', self.calls.read_text())

    def test_unhealthy_database_times_out(self):
        self.env.update(HEALTH_STATE='unhealthy', CI_READY_TIMEOUT_SECONDS='1')
        result = self.check('database', 0)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Timed out', result.stderr)

    def test_http_failure_times_out_even_when_containers_are_healthy(self):
        self.env.update(HTTP_FAIL='1', CI_READY_TIMEOUT_SECONDS='1')
        result = self.check('ready', 0)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Timed out waiting for Trading API', result.stdout)

    def test_invalid_timeout_and_absent_healthcheck_fail(self):
        self.env['CI_READY_TIMEOUT_SECONDS'] = 'invalid'
        self.assertNotEqual(self.check('database', 0).returncode, 0)
        self.env['CI_READY_TIMEOUT_SECONDS'] = '1'
        self.env['HEALTH_STATE'] = 'missing'
        result = self.check('database', 0)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No healthcheck', result.stderr)

    def test_staff_builds_have_unique_tags_and_fail_fast(self):
        self.env['CI_PROJECT_NAME'] = 'endgame-ci-0123456789abcdef'
        self.assertEqual(self.check('staff-build', 0).returncode, 0)
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(len(calls), 4)
        for call in calls:
            self.assertEqual(call[0], 'build')
            self.assertIn(':endgame-ci-0123456789abcdef', ' '.join(call))
            self.assertNotIn(':local', ' '.join(call))
        self.calls.unlink()
        self.assertEqual(self.check('staff-build', 17).returncode, 17)
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)

    def test_staff_build_refuses_missing_project(self):
        self.env.pop('CI_PROJECT_NAME', None)
        self.assertNotEqual(self.check('staff-build', 0).returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_sonar_requires_gate_and_keeps_token_out_of_arguments(self):
        self.assertEqual(self.check('sonar', 0).returncode, 0)
        args = json.loads(self.calls.read_text().splitlines()[0])
        self.assertIn('-Dsonar.qualitygate.wait=true', args)
        self.assertIn('-Dsonar.qualitygate.timeout=300', args)
        self.assertIn('SONAR_TOKEN', args)
        self.assertNotIn(self.env['SONAR_TOKEN'], ' '.join(args))

    def test_missing_coverage_fails_before_sonar_runs(self):
        (self.root / 'frontend/coverage/frontend/lcov.info').unlink()
        self.assertNotEqual(self.check('sonar', 0).returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_missing_sonar_credentials_never_runs_docker(self):
        del self.env['SONAR_TOKEN']
        self.assertNotEqual(self.check('sonar', 0).returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_log_write_failure_fails_the_check(self):
        (self.root / 'gitleaks-output.txt').mkdir()
        self.assertNotEqual(self.check('secrets', 0).returncode, 0)

    def test_jenkins_runs_required_checks_without_suppression(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        for action in ('secrets', 'services', 'sonar'):
            self.assertIn("sh 'bash scripts/ci-checks.sh " + action + "'", pipeline)
        self.assertNotIn('|| true', pipeline)
        self.assertIn('archiveArtifacts', pipeline)
        self.assertIn("sh 'bash scripts/ci-compose.sh cleanup'", pipeline)


if __name__ == '__main__':
    unittest.main()
