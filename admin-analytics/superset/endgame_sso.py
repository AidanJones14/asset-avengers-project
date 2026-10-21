"""Session-bound SSO from J.A.R.V.I.S.; passwords and bearer JWTs never reach this route."""
import json
import os
import re
import urllib.error
import urllib.request
from flask import abort, jsonify, redirect, request, session
from flask_login import current_user, login_user, logout_user
from superset import db, security_manager as sm
from superset.extensions import csrf


class SsoDenied(Exception):
    pass


def backchannel(path, body):
    secret = os.environ.get('SUPERSET_SSO_SECRET', '')
    if len(secret) < 32:
        raise SsoDenied()
    # Fixed server-side destination; never follow a redirect carrying the client secret.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    url = os.environ.get('ENDGAME_AUTH_URL', 'http://auth-server:3000').rstrip('/')
    message = urllib.request.Request(url + '/auth/superset/' + path,
        data=json.dumps(body).encode(), headers={'Content-Type': 'application/json',
        'X-Endgame-SSO-Secret': secret}, method='POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(message, timeout=5) as response:
            return json.load(response)
    except (urllib.error.URLError, ValueError, TimeoutError) as error:
        # Never log the handoff, lease, secret, or an upstream response body.
        raise SsoDenied() from error


def configure_sso(app):
    @app.route('/endgame/sso', methods=['POST'])
    @csrf.exempt
    def endgame_sso_login():
        # This endpoint alone is CSRF-exempt: exact browser Origin plus an unguessable,
        # one-use, 60-second ticket replaces a normal cross-site login form.
        origins = {value.strip().rstrip('/') for value in os.environ.get('SUPERSET_EMBED_ORIGINS', '').split(',')}
        if request.headers.get('Origin', '').rstrip('/') not in origins:
            abort(403)
        ticket = request.form.get('ticket', '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}', ticket):
            abort(400)
        try:
            identity = backchannel('exchange', {'ticket': ticket})
        except SsoDenied:
            return 'This sign-in link expired. Open Superset again from J.A.R.V.I.S.', 401, {'Cache-Control': 'no-store'}
        username = identity['username']
        if not re.fullmatch(r'endgame_[0-9a-f-]{36}', username):
            abort(403)
        roles = [sm.find_role(name) for name in ('Alpha', 'sql_lab', 'ReportingSqlAuthor')]
        if any(role is None for role in roles):
            abort(503)
        user = sm.find_user(username=username)
        other = sm.find_user(email=identity['email'])
        if other is not None and (user is None or other.id != user.id):
            # Never attach accounts by email. The auth UUID is the identity key.
            return 'A Superset email conflict needs administrator review.', 409
        if user is None:
            user = sm.add_user(username, identity['firstName'] or 'Analyst', identity['lastName'],
                identity['email'], roles, password=os.urandom(32).hex())
        if user is None or not user.is_active:
            abort(403)
        user.first_name = identity['firstName'] or 'Analyst'
        user.last_name = identity['lastName']
        user.email = identity['email']
        # Managed SSO users never inherit Admin or guest-token issuer privileges.
        user.roles = roles
        db.session.commit()
        session.clear()
        login_user(user, remember=False)
        session['endgame_sso_lease'] = identity['sessionToken']
        session['endgame_sso_subject'] = identity['subject']
        response = redirect('/sqllab/')
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    @app.route('/endgame/sso-required', methods=['GET'])
    def endgame_sso_required():
        return 'Your analytics session ended. Sign in to J.A.R.V.I.S. and choose Open Superset workspace.', 401, {'Cache-Control': 'no-store'}

    @app.before_request
    def check_endgame_session():
        lease = session.get('endgame_sso_lease')
        if not lease or request.path.startswith(('/static/', '/health', '/endgame/')):
            return None
        try:
            identity = backchannel('session', {'sessionToken': lease})
            if identity['subject'] != session.get('endgame_sso_subject') or not current_user.is_authenticated or current_user.username != identity['username']:
                raise SsoDenied()
        except SsoDenied:
            logout_user()
            session.clear()
            # Let the embedded viewer establish its own scoped guest-token flow
            # after clearing an expired author cookie, without granting author access.
            if request.path.startswith('/embedded/'):
                return None
            if request.path.startswith('/api/'):
                return jsonify(message='Sign in to J.A.R.V.I.S. again'), 401
            return redirect('/endgame/sso-required')
        return None
