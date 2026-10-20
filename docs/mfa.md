# Authenticator MFA: optional for clients, required for staff

Client signup offers an unchecked **Use an authenticator app (MFA) to make my
account more secure** checkbox. Unchecked clients sign in with a password; checked
clients must finish QR enrollment before receiving a session. ADMIN (Ultron) and
ANALYST (Friday) accounts always require MFA. Existing enrolled clients continue
using their authenticator at every new login, including after explicit logout.

NestJS owns authentication; Firebase is not used. Email verification remains off
for dummy-email testing. Password reset never disables an enrolled authenticator.

## Setup and startup

The single root `.env` needs a stable `MFA_ENCRYPTION_KEY`, generated with
`openssl rand -base64 32`. Keep it secret and backed up separately from the database;
losing it prevents normal TOTP verification. It must be different from `JWT_SECRET`.
The local key was provisioned during implementation; other machines need their own.

```bash
# Repository root; preserves saved database volumes.
bash scripts/start-project.sh --all
```

Startup applies `DB/auth_db.schema.sql` to existing auth storage before rebuilding.
It adds MFA/reset tables and `users.mfa_required`. It revokes password-only sessions
only for opted-in, enrolled or staff identities. A plain
`docker-compose up` does not migrate existing storage. Both Java services must be
rebuilt too: the trading API accepts signed `amr: ["pwd"]` only for a CLIENT with
explicit `mfa_required: false`; staff access still requires `pwd` and `mfa`.
Legacy JWTs without that claim are rejected. Keep using `docker-compose` on older VMs;
no `--quiet` or `--wait` option is needed. Missing encryption configuration fails
closed for enrollment and MFA-required accounts.

## Signup and first login

New setup and replacement QR codes use **Endgame Trading** as the authenticator
issuer, with the user’s email as the account label. Entries already saved in an
authenticator keep their previous name; rename those entries in the authenticator
app to Endgame Trading. Renaming an entry does not change its codes.

1. Enter first name, last name, email and password on signup.
2. Leave the MFA checkbox unchecked for password-only login, or check it to open
   **Set up your authenticator** immediately after registration. The server persists
   the choice; clearing browser state cannot bypass an opted-in enrollment.
3. Download Google Authenticator, Microsoft Authenticator or another compatible app.
4. Scan the QR code, or enter the manual setup key, and submit the six-digit code.
5. Save the ten one-use recovery codes privately. Select **I saved my codes** to
   enter the application. Codes are displayed only once.

The QR is generated inside the auth service, never by an external QR website.
For MFA-enabled accounts, the server verifies the code before creating a session
or issuing tokens. Setup cannot be bypassed by hiding the component. Clients who
skipped MFA can later choose **Authenticator security → Set up authenticator**
on the login page after entering their credentials.

Seeded David/Priya accounts require setup on first login. Unenrolled clients
without an opt-in use password-only login. Fixtures deliberately
contain no shared authenticator secrets. Restarting or loading demo data preserves
an existing enrollment; it does not require scanning a QR every time.

Example: Priya signs into Friday with her seeded email/password. If she has never
enrolled, she sees the QR. Once enrolled, subsequent logins show only the code
challenge; her account UUID and reporting permissions stay the same.

## Subsequent login, logout and refresh

Password verification returns tokens directly for clients without MFA; opted-in,
enrolled and staff accounts receive a short-lived MFA challenge instead.
An enrolled user enters their authenticator code or an unused recovery code.
Only then are the access JWT and rotating refresh token issued.

| Situation | Authenticator requirement |
|---|---|
| Client without MFA | Password-only login |
| Opted-in client or unenrolled staff identity | Complete QR setup |
| MFA account logs in after explicit logout | Enter authenticator/recovery code again |
| Login after session expiry | Enter authenticator/recovery code again |
| Browser reload during a valid session | Existing refresh session restores access |
| Automatic access-token refresh | No repeated prompt while the MFA session remains valid |

There is no two-minute logout grace period or trusted-device bypass. Logout revokes
the refresh session. Already-issued MFA access JWTs remain valid at Spring until
expiry (normally 15 minutes), because the Java APIs do not introspect sessions.
The UI clears its access token at logout. This update does not implement immediate
server-side access-token revocation.

## Replace an authenticator

From the sign-in page, enter email/password and open **Authenticator security →
Replace authenticator**. Verify the current authenticator or an unused recovery
code, scan the replacement QR, and verify the new authenticator. Save the new
recovery codes before entering the app.

The old authenticator stays active until the replacement code is verified. Only
then does the transaction replace the secret, invalidate old recovery codes, revoke
existing refresh sessions and create the new MFA session. Abandoning replacement
does not remove the old factor. The old `/mfa/disable` endpoints return 403; an existing enrollment cannot currently be turned off through these endpoints.

Someone who loses both their authenticator and recovery codes cannot use an email
password reset to bypass MFA. An identity-verified support recovery process would
be needed; no help-desk override is implemented.

## HTTP contract

POST JSON bodies through the same-origin `/auth` proxy. Never put passwords,
secrets, codes or challenge tokens in URLs or application logs.

| Endpoint | Body | Response |
|---|---|---|
| `/auth/register` | `firstName`, `lastName`, `email`, `password`, optional boolean `mfaEnabled` (default false) | Registration only; no session |
| `/auth/login` | `email`, `password` | Tokens for optional clients; otherwise MFA challenge with `purpose: enroll` or `login`; setup includes QR/manual key |
| `/auth/mfa/setup` | `email`, `password` | Required enrollment challenge for an unenrolled account |
| `/auth/mfa/enable` | `challengeToken`, six-digit `code` | Tokens plus ten `recoveryCodes` |
| `/auth/mfa/verify` | Login `challengeToken`, `code` | Access/refresh token pair |
| `/auth/mfa/replace/start` | `email`, `password` | Challenge to prove the old factor |
| `/auth/mfa/replace/verify` | Replacement `challengeToken`, old `code` | `purpose: replace-enroll`, new QR/manual key |
| `/auth/mfa/replace/enable` | New enrollment `challengeToken`, new six-digit `code` | Tokens plus new recovery codes |
| `/auth/mfa/disable` and `/disable/start` | Any | 403: disabling an enrolled authenticator is unsupported |

Example of an enrolled account's password response:

```json
{"mfaRequired":true,"purpose":"login","challengeToken":"opaque-random-value"}
```

Submit to `/auth/mfa/verify`:

```json
{"challengeToken":"opaque-random-value","code":"012345"}
```

Keep codes as strings to preserve leading zeros. Recovery codes use 16 lowercase
hexadecimal characters. Challenges expire in five minutes and allow five failures.
Starting another login/setup/replacement invalidates older challenges for that
identity. Five failed MFA codes lock the identity for five minutes, including across
new challenges. Existing route/IP throttling is 20 requests per route per 15 minutes.
401 means invalid/expired/reused proof or lockout; 409 is an incompatible enrollment
state; 429 is route throttling; 503 indicates missing encryption configuration.

## Auth database and implementation

| Table | Stored data |
|---|---|
| `users.mfa_required` | Client signup opt-in; staff requirements are also enforced from roles |
| `user_mfa` | Encrypted secret, enabled timestamp, last accepted TOTP step, failure count and lockout |
| `mfa_challenges` | Hashed random challenge, user UUID, purpose, expiry, attempts and consumption; encrypted pending replacement secret |
| `mfa_recovery_codes` | Hashed random one-use recovery codes and used timestamp |
| `sessions` | Existing expiry/revocation fields plus `mfa_verified_at` |

Only auth stores these records. They never enter trading, Kafka, reporting,
Superset or audit PDFs. AES-256-GCM uses fresh IVs and binds ciphertext to its
owner. TOTP secrets must be decryptable; passwords remain bcrypt hashes.

TOTP uses six digits, 30-second steps and one adjacent step on either side for clock
differences. Already accepted time steps cannot be reused; after setup, a new login
may need the app's next displayed code. Keep server/device clocks synchronized.

User-row locks serialize enrollment, replacement, code use and password resets.
The consumed challenge/recovery code and session creation commit together. Failures
commit their attempt counters. Successful proof issues `amr: ["pwd", "mfa"]` in
the JWT. Password-only clients get `amr: ["pwd"]` and signed `mfa_required: false`.
The trading API enforces this policy; the staff API always requires both methods.
Both validate signature, issuer, audience and token time. MFA challenges have no such API authority. HTTPS is needed when deployed.

`mfa.service.ts` owns encryption/proof; `auth.service.ts` orchestrates password,
MFA and sessions; `sessions.repository.ts` enforces the session gate. Client UI is
in `frontend/src/app/auth/`; staff UI uses `internal-frontend/src/api.js` and `app.js`.

[Email service and password reset](email-service.md) explains the separate recovery
flow, including separate email-code verification before password entry and rejection
of the current password. Auth tests run with `npm test`; database tests opt in with
`MFA_TEST_DATABASE_URL` pointing to an isolated disposable database. They never
fall back to application DB settings. Browser tests use simulated email responses
and do not deliver real codes.
