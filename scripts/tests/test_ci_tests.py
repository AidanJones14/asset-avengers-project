"""Check test-runner failure propagation and coverage source mapping."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class TestRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        for name in ('ci-tests.sh', 'ci-lcov.cjs'):
            shutil.copy(ROOT / 'scripts' / name, self.root / 'scripts')
        tools = self.root / 'bin'
        tools.mkdir()
        docker = tools / 'docker'
        docker.write_text('''#!/usr/bin/env python3
import json,os,sys
with open(os.environ['CALLS'],'a') as file: file.write(json.dumps(sys.argv[1:])+'\\n')
sys.exit(int(os.environ.get('TOOL_EXIT','0')))
''')
        docker.chmod(0o755)
        self.calls = self.root / 'calls'
        self.env = dict(os.environ, PATH=str(tools) + ':' + os.environ['PATH'], CALLS=str(self.calls))

    def run_check(self, action):
        return subprocess.run(['bash', str(self.root / 'scripts/ci-tests.sh'), action],
                              env=self.env, text=True, capture_output=True)

    def test_pipeline_requires_prepared_builder(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        self.assertIn("agent { label 'avengers-builder' }", pipeline)
        self.assertNotRegex(pipeline, r'\bagent\s+any\b')

    def test_notifications_use_email_one_without_team_fallback(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        self.assertEqual(pipeline.count('to: recipient,'), 2)
        self.assertEqual(pipeline.count("def recipient = (env.EMAIL_1 ?: '').trim()"), 2)
        self.assertEqual(pipeline.count("if (!recipient) {"), 2)
        self.assertEqual(pipeline.count("recipientProviders: []"), 2)
        self.assertEqual(pipeline.count("                    cc: '',"), 2)
        self.assertEqual(pipeline.count("bcc: '',"), 2)
        for number in range(2, 6):
            self.assertNotIn('env.EMAIL_' + str(number), pipeline)

    def test_pipeline_keeps_bulk_logs_out_of_process_environment(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        self.assertNotRegex(pipeline, r'env\.(?:SERVICES_OUTPUT|GITLEAKS_OUTPUT)\s*=')
        # Both log files must still be captured and published for diagnosis.
        helper = (ROOT / 'scripts/ci-checks.sh').read_text()
        for log in ('services-output.txt', 'gitleaks-output.txt'):
            self.assertIn('tee ' + log, helper)
            self.assertIn(log, pipeline.split('archiveArtifacts', 1)[1])

    def test_test_failures_stop_each_stage_immediately(self):
        self.env['TOOL_EXIT'] = '23'
        for stage in ('java', 'web', 'python'):
            with self.subTest(stage=stage):
                self.calls.unlink(missing_ok=True)
                self.assertEqual(self.run_check(stage).returncode, 23)
                self.assertEqual(len(self.calls.read_text().splitlines()), 1)

    def test_java_runs_both_services_without_skipping_tests(self):
        self.assertEqual(self.run_check('java').returncode, 0)
        calls = [json.loads(line) for line in self.calls.read_text().splitlines()]
        self.assertEqual(len(calls), 2)
        for module, call in zip(('backend', 'internal-backend'), calls):
            self.assertIn('/workspace/' + module, call)
            self.assertIn('test', call)
            self.assertIn('-e', call)
            self.assertNotIn('-DskipTests', call)

    def test_clean_preserves_sources(self):
        for module in ('backend', 'internal-backend', 'auth-server', 'frontend', 'internal-frontend'):
            path = self.root / module
            (path / 'coverage').mkdir(parents=True)
            (path / 'src').mkdir()
            (path / 'src/source.txt').write_text('keep')
            (path / 'test-results').mkdir()
        self.assertEqual(self.run_check('clean').returncode, 0)
        for module in ('auth-server', 'frontend', 'internal-frontend'):
            self.assertFalse((self.root / module / 'coverage').exists())
            self.assertEqual((self.root / module / 'src/source.txt').read_text(), 'keep')

    @unittest.skipUnless(shutil.which('node'), 'Node is required for LCOV checks')
    def test_lcov_maps_duplicate_source_names_to_their_service_and_is_repeatable(self):
        for module in ('frontend', 'internal-frontend'):
            directory = self.root / module
            (directory / 'src').mkdir(parents=True)
            (directory / 'src/main.ts').write_text('export const value = 1;')
            (directory / 'coverage').mkdir()
            report = directory / 'coverage/lcov.info'
            report.write_text('TN:\nSF:src/main.ts\nDA:1,1\nend_of_record\n')
            for _ in range(2):
                result = subprocess.run(['node', str(self.root / 'scripts/ci-lcov.cjs'), module], capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('SF:' + module + '/src/main.ts', report.read_text())

    def test_jenkins_runs_tests_before_sonar_and_publishes_reports(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        for stage in ('java', 'auth', 'web', 'python'):
            self.assertLess(pipeline.index('bash scripts/ci-tests.sh ' + stage), pipeline.index("stage('SonarQube Analysis')"))
        self.assertNotIn('-DskipTests', pipeline)
        self.assertIn('junit testResults:', pipeline)


if __name__ == '__main__':
    unittest.main()
