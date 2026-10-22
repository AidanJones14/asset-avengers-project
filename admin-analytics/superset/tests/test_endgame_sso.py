"""Run with Superset's Python environment; all identity/network/database boundaries are mocked."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
from flask import Flask
from flask_login import LoginManager, UserMixin

source = Path(os.environ.get('ENDGAME_SSO_MODULE', '/app/pythonpath/endgame_sso.py'))
spec = importlib.util.spec_from_file_location('tested_endgame_sso', source)
sso = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sso)

class User(UserMixin):
    id = 7
    username = 'endgame_11111111-1111-1111-1111-111111111111'
    email = 'analyst@example.invalid'
    roles = []

class SsoRoutes(unittest.TestCase):
    def setUp(self):
        self.user = User()
        self.identity = dict(subject='11111111-1111-1111-1111-111111111111',username=self.user.username,
            firstName='Priya',lastName='Analyst',email=self.user.email,sessionToken='s'*43)
        self.app = Flask(__name__)
        self.app.secret_key = 'test-cookie-secret'
        manager = LoginManager(self.app)
        manager.user_loader(lambda identifier: self.user)
        self.sm = Mock()
        self.sm.find_role.side_effect = lambda name: name
        self.sm.find_user.return_value = None
        self.sm.add_user.return_value = self.user
        self.stack = [patch.object(sso,'sm',self.sm),patch.object(sso,'db',Mock()),
            patch.object(sso,'backchannel',return_value=self.identity),
            patch.dict(os.environ,{'SUPERSET_EMBED_ORIGINS':'http://localhost:8086'})]
        for item in self.stack:item.start()
        self.addCleanup(lambda: [item.stop() for item in reversed(self.stack)])
        sso.configure_sso(self.app)
        self.app.add_url_rule('/probe','probe',lambda:'protected')
        self.app.add_url_rule('/embedded/test','embedded',lambda:'guest bootstrap')
        self.client = self.app.test_client()
    def post(self, **kwargs):
        return self.client.post('/endgame/sso',data={'ticket':'t'*43},headers={'Origin':'http://localhost:8086'},**kwargs)
    def test_origin_and_ticket_validation(self):
        self.assertEqual(self.client.post('/endgame/sso',data={'ticket':'t'*43},headers={'Origin':'https://untrusted.invalid'}).status_code,403)
        self.assertEqual(self.client.post('/endgame/sso',data={'ticket':'bad'},headers={'Origin':'http://localhost:8086'}).status_code,400)
        self.assertEqual(self.client.get('/endgame/sso').status_code,405)
    def test_individual_account_and_restricted_roles(self):
        response=self.post()
        self.assertEqual(response.status_code,302)
        self.assertEqual(response.location,'/sqllab/')
        self.assertEqual(self.user.roles,['Alpha','sql_lab','ReportingSqlAuthor'])
        self.sm.add_user.assert_called_once()
        self.assertEqual(self.client.get('/probe').status_code,200)
    def test_rejected_exchange_creates_no_account(self):
        sso.backchannel.side_effect=sso.SsoDenied()
        self.assertEqual(self.post().status_code,401)
        self.sm.add_user.assert_not_called()
    def test_revoked_lease_logs_out_and_blocks_api(self):
        self.assertEqual(self.post().status_code,302)
        sso.backchannel.side_effect=sso.SsoDenied()
        self.assertEqual(self.client.get('/api/v1/chart/').status_code,401)
        with self.client.session_transaction() as state:
            self.assertNotIn('_user_id',state)
            self.assertNotIn('endgame_sso_lease',state)
    def test_expired_author_cookie_does_not_prevent_guest_bootstrap(self):
        self.assertEqual(self.post().status_code,302)
        sso.backchannel.side_effect=sso.SsoDenied()
        self.assertEqual(self.client.get('/embedded/test').status_code,200)
        with self.client.session_transaction() as state:
            self.assertNotIn('endgame_sso_lease',state)
    def test_email_collision_is_not_account_linking(self):
        other=User();other.id=99
        self.sm.find_user.side_effect=lambda **values: other if 'email' in values else None
        self.assertEqual(self.post().status_code,409)
        self.sm.add_user.assert_not_called()
    def test_identity_mismatch_is_rejected(self):
        self.assertEqual(self.post().status_code,302)
        sso.backchannel.return_value={**self.identity,'subject':'different'}
        self.assertEqual(self.client.get('/probe').location,'/endgame/sso-required')

if __name__ == '__main__':unittest.main()
