"""Keep reviewed false positives exact rather than excluding entire test files."""
from pathlib import Path
import re
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[2]


class GitleaksExceptionsTest(unittest.TestCase):
    def test_exceptions_require_exact_path_and_full_line(self):
        config = tomllib.loads((ROOT / '.gitleaks.toml').read_text())
        self.assertTrue(config['extend']['useDefault'])
        self.assertNotIn('disabledRules', config['extend'])
        self.assertEqual(len(config['allowlists']), 4)
        for entry in config['allowlists']:
            if entry['regexTarget'] == 'secret':
                self.assertNotIn('paths', entry)
                for value in ('test-secret-that-is-at-least-32-characters-long', 'mandatory-mfa-test-secret-at-least-32-characters'):
                    self.assertTrue(any(re.fullmatch(regex, value) for regex in entry['regexes']))
                    self.assertFalse(any(re.fullmatch(regex, value + '-different') for regex in entry['regexes']))
                continue
            self.assertEqual(entry['condition'], 'AND')
            self.assertEqual(entry['regexTarget'], 'line')
            pattern = entry['paths'][0]
            relative = pattern[1:-1].replace(r'\.', '.')
            self.assertTrue((ROOT / relative).is_file(), pattern)
            self.assertIsNotNone(re.fullmatch(pattern, relative))
            lines = (ROOT / relative).read_text().splitlines()
            self.assertTrue(any(re.fullmatch(regex, line) for regex in entry['regexes'] for line in lines), pattern)
            # Same file with a new credential must not inherit a whole-file exemption.
            self.assertFalse(any(re.fullmatch(regex, 'JWT_SECRET="unexpected-new-credential-value"') for regex in entry['regexes']))
            self.assertFalse(re.fullmatch(pattern, 'production/credentials.env'))

    def test_scan_failure_marks_build_failed_but_continues(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        stage = pipeline.split("stage('Git Leaks Scan')", 1)[1].split("stage('Initialize Isolated CI Environment')", 1)[0]
        self.assertIn("catchError(buildResult: 'FAILURE', stageResult: 'FAILURE', catchInterruptions: false)", stage)
        self.assertIn("sh 'bash scripts/ci-checks.sh secrets'", stage)

    def test_jenkins_explicitly_loads_reviewed_config(self):
        self.assertIn('--config /repo/.gitleaks.toml', (ROOT / 'scripts/ci-checks.sh').read_text())


if __name__ == '__main__':
    unittest.main()
