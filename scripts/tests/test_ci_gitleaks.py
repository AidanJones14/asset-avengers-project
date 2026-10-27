"""Keep only exact reusable dummy values; load reviewed historical fingerprints explicitly."""
from pathlib import Path
import re
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[2]


class GitleaksExceptionsTest(unittest.TestCase):
    def test_only_exact_dummy_keys_are_allowed_globally(self):
        config = tomllib.loads((ROOT / '.gitleaks.toml').read_text())
        self.assertTrue(config['extend']['useDefault'])
        self.assertNotIn('disabledRules', config['extend'])
        self.assertEqual(len(config['allowlists']), 1)
        entry = config['allowlists'][0]
        self.assertEqual(entry['regexTarget'], 'secret')
        self.assertEqual(set(entry), {'description', 'regexTarget', 'regexes'})
        values = ('test-secret-that-is-at-least-32-characters-long',
                  'mandatory-mfa-test-secret-at-least-32-characters')
        self.assertEqual(len(entry['regexes']), len(values))
        for value in values:
            self.assertTrue(any(re.fullmatch(regex, value) for regex in entry['regexes']))
            self.assertFalse(any(re.fullmatch(regex, value + '-different') for regex in entry['regexes']))
        self.assertFalse(any(re.fullmatch(regex, 'unexpected-new-credential-value') for regex in entry['regexes']))

    def test_scan_failure_marks_build_failed_but_continues(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        stage = pipeline.split("stage('Git Leaks Scan')", 1)[1].split("stage('Initialize Isolated CI Environment')", 1)[0]
        self.assertIn("catchError(buildResult: 'FAILURE', stageResult: 'FAILURE', catchInterruptions: false)", stage)
        self.assertIn("sh 'bash scripts/ci-checks.sh secrets'", stage)

    def test_jenkins_explicitly_loads_reviewed_config(self):
        helper = (ROOT / 'scripts/ci-checks.sh').read_text()
        self.assertIn('--config /repo/.gitleaks.toml', helper)
        self.assertIn('--gitleaks-ignore-path /repo/.gitleaksignore', helper)
        self.assertTrue((ROOT / '.gitleaksignore').is_file())


if __name__ == '__main__':
    unittest.main()
