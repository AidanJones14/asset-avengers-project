"""Exercise the exact branch policy invoked by Jenkins, without Docker or credentials."""
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]


class PullRequestPolicyTests(unittest.TestCase):
    def policy(self, source='', target='', change_id='123', fork=''):
        env = dict(os.environ, CHANGE_ID=change_id, CHANGE_BRANCH=source,
                   CHANGE_TARGET=target, CHANGE_FORK=fork)
        return subprocess.run(['bash', str(ROOT / 'scripts/ci-pr-policy.sh')],
                              env=env, text=True, capture_output=True)

    def test_team_branches_into_dev(self):
        for source in ('feature/CICD_Updates', 'feature/mfa_merge_dev',
                       'fix/frontend-refactor', 'hotfix/login', 'analyst-changes', 'main'):
            with self.subTest(source=source):
                self.assertEqual(self.policy(source, 'dev').returncode, 0)

    def test_release_pr_into_main(self):
        self.assertEqual(self.policy('dev', 'main').returncode, 0)

    def test_other_routes_are_rejected(self):
        for source, target in [('feature/test', 'main'), ('fix/test', 'release'),
                               ('dev', 'dev'), ('main', 'main'), ('dev', 'staging')]:
            with self.subTest(source=source, target=target):
                self.assertNotEqual(self.policy(source, target).returncode, 0)

    def test_non_pr_and_incomplete_metadata_are_rejected(self):
        for source, target, change_id in [('feature/test', 'dev', ''),
                                          ('', 'dev', '123'), ('dev', '', '123')]:
            self.assertNotEqual(self.policy(source, target, change_id).returncode, 0)

    def test_forks_are_rejected_before_the_credentialed_pipeline(self):
        for source, target in [('feature/test', 'dev'), ('dev', 'main')]:
            self.assertNotEqual(self.policy(source, target, fork='outside-repository').returncode, 0)

    def test_jenkins_validates_before_credentials_and_docker(self):
        pipeline = (ROOT / 'Jenkinsfile').read_text()
        policy = pipeline.index('bash scripts/ci-pr-policy.sh')
        self.assertLess(policy, pipeline.index('withCredentials('))
        self.assertLess(policy, pipeline.index("stage('Initialize Isolated CI Environment')"))
        self.assertIn("currentBuild.result = 'NOT_BUILT'", pipeline)


if __name__ == '__main__':
    unittest.main()
