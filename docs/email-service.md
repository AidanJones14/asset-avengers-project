# Resend email service and password resets

NestJS sends password-reset codes with the official `resend` Node SDK. The existing
secret name is **`Email_Service`**, exactly as written, in the single root `.env`.
It is passed only to the auth container. Browser bundles, Spring APIs, Kafka and
reporting do not receive the key. Email verification at signup is intentionally
not implemented for the current dummy-email testing workflow.

## Configuration

```dotenv
# Root .env only. Never put real credentials in .env.example or Git.
Email_Service=YOUR_RESEND_SENDING_KEY
EMAIL_FROM=Asset Avengers <onboarding@resend.dev>
# Optional published Resend template ID or alias; blank uses a plain-text email.
EMAIL_RESET_TEMPLATE_ID=
```

The current key identifies itself as sending-only when asked to read templates.
That restriction is appropriate for the running app. A 401 with
`restricted_api_key` from a management endpoint does not establish that sending
is broken. Runtime code does not need domain/template-management permissions.

The default sender is Resend's test sender. It is not a production sender and has
recipient restrictions: use your Resend account's permitted address or designated
Resend test addresses. Arbitrary dummy emails cannot receive messages. Do not send
to made-up/unowned real domains. Backend/UI automated tests use a simulated sender,
so no dummy-account mail is sent by the test suite.

Before sending to real users, verify a domain in Resend, configure its DNS and set
`EMAIL_FROM` to an address on that domain, for example
`Asset Avengers <security@mail.yourdomain.com>`. The application does not make DNS
changes or register a domain. No domain was supplied during implementation, so
local configuration uses the test sender. Email verification should be added
before public use, even though it is deliberately off during testing.

After updating configuration:

```bash
bash scripts/start-project.sh --all
```

## User experience

All three sign-in pages offer **Forgot password?**.

1. Enter the account email and choose **Send reset code**.
2. The same generic message is shown whether the account exists or not.
3. Read the six-digit code from the email.
4. Select **Verify email code**. Password fields are hidden until the server verifies it.
5. Choose a matching new password of 12–72 characters that differs from the current password.
6. Return to sign-in and use the new password plus the existing authenticator or
   a recovery code. An unenrolled identity still has to complete required setup.

Example: David forgets his Ultron password but still has his authenticator. He
requests an emailed code, verifies it, chooses a different password, then signs in and enters his
normal authenticator code. Neither the email code nor the password reset grants
an application JWT by itself.

If David also loses his authenticator, an unused MFA recovery code can complete
login and authorize authenticator replacement. Losing both requires a separately
designed, identity-verified support process; emailed password codes cannot disable MFA.

## API contract

POST JSON through the same-origin `/auth` proxy:

```text
POST /auth/forgot-password
{"email":"client@example.com"}

200
{"message":"If an account exists for that email, a reset code will be sent. Codes expire after 10 minutes.",
 "requestToken":"opaque-random-value"}
```

```text
POST /auth/verify-reset-code
{"requestToken":"opaque-random-value","code":"012345"}

200
{"resetToken":"verified-reset-grant","expiresInSeconds":300,
 "message":"Email code verified. Choose a new password."}
```

```text
POST /auth/reset-password
{"resetToken":"verified-reset-grant","newPassword":"new-strong-password"}

200
{"success":true,"message":"Password updated. Sign in with your new password and authenticator."}
```

The examples contain placeholders, not working codes. `requestToken` stays in
browser memory and must accompany the code during verification. Successful
verification consumes the code and issues a separate five-minute `resetToken` grant.
The final endpoint accepts that grant, not the original request token or email code.
The grant works once and grants no trading/staff access. Reusing the current password
returns HTTP 400 with `PASSWORD_REUSED`; the grant remains usable so the user can
choose another password. The UI shows length/matching checks and explains that the
current-password comparison is performed securely by the server. A code sent for one request cannot
reset another account. The endpoint does not accept a caller-supplied user UUID.
Codes expire 10 minutes after the request, allow at most five guesses, and work
once. New accepted requests invalidate older codes for the account. Requests have
a 60-second per-email cooldown and a maximum of three per 15 minutes, applied to
known and unknown emails alike. Cooldown returns an explicit HTTP 429 with
`RESET_REQUEST_LIMIT`; it does not return a new unusable token. The UI preserves
the original challenge on a failed resend. The existing
20-request route/IP throttle also applies. Invalid, expired or consumed proof gives
401; malformed bodies give 400. Delivery failure never reveals whether an email
is registered. If delivery is unavailable, users see the generic request message;
operators diagnose the safe worker status/logs and provider dashboard.

## Storage and delivery

The auth database owns two additional tables:

| Table | Stored data |
|---|---|
| `password_reset_requests` | Request UUID, hashed opaque token, user UUID (null for unknown email), HMAC-protected code, keyed email hash for throttling, created/expiry/verification/consumption timestamps, attempts, hashed verified grant and five-minute grant expiry |
| `auth_email_outbox` | Reset UUID, encrypted recipient/code payload, delivery attempts and retry time, provider email ID, sent/failed timestamps and safe error classification |

A short numeric code has little entropy. Its verification value is HMAC-SHA256
with a server-held key and request binding, not a plain hash vulnerable to offline
six-digit guessing after a DB leak. Delivery payloads are AES-GCM encrypted with
request binding. The same stable external MFA encryption key protects these auth
secrets with separate cryptographic purposes. Payloads are erased after successful
send, terminal failure, cancellation or expiry. Requests older than one day are
cleaned up when new requests arrive. No reset secrets are seeded or replicated.

The HTTP request writes the reset challenge and delivery job in one database
transaction. A Nest lifecycle worker checks every five seconds, leases a job with
`FOR UPDATE SKIP LOCKED`, and sends outside a database transaction. The provider's
availability therefore does not hold an HTTP request open or disclose account
existence through a slow send.

The official SDK returns `{data,error}`. The service checks both and stores the
provider email ID on acceptance. Acceptance is not proof of delivery. The stable
idempotency key is `password-reset/<request UUID>`, so retrying the same job does
not intentionally create another email. Network failures, HTTP 429 and 5xx retry
with exponential backoff and `Retry-After` support, up to five delivery attempts
while the code remains valid. Other 4xx errors are terminal and require fixing
configuration and requesting another code. Multiple auth instances can lease jobs;
a crashed worker's lease becomes retryable after 60 seconds.

Code verification locks the user and request, consumes the code, and stores a hashed
short-lived grant. Reset completion locks the same records, checks the grant and
rejects a password matching the current bcrypt hash, then changes only the bcrypt password,
consumes outstanding reset requests, revokes refresh sessions and invalidates MFA
challenges in one transaction. **It does not remove the authenticator or MFA recovery
codes.** Concurrent submissions cannot spend the same reset code twice. Existing
access JWTs remain valid until their normal expiry; immediate introspection/revocation
is not implemented.

## Optional remotely editable template

Password-reset emails use the subject **Reset your Endgame password** and footer
**Endgame Trading by Asset Avengers**. The template bootstrap uses the same branding.

The default plain-text email works with a sending-only key and needs no template
management. For a branded HTML email that your team can edit in Resend, use the
optional provisioning script:

```bash
cd auth-server
npm run email:setup
```

It reads `Email_Service`, or a securely supplied `RESEND_SETUP_API_KEY` for this
process, creates/publishes the `asset-avengers-password-reset` template if absent,
verifies its variable definitions, and writes its ID into the root `.env`.
It requires template-management permission. Do not replace the running app's
sending-only key with a full-access key just to run the application.
The app uses exactly `CODE` (string) and `EXPIRES_MINUTES` (number) when sending
that template. HTML is uploaded by the provisioning script and is not rendered
by the running service. Never put a real reset code in a setup command or template
fallback value.

## Verification and current limits

Database tests cover reset expiry/attempts, unknown-email responses, preserving MFA,
revoking sessions, duplicate submissions and durable delivery retry. SDK tests mock
`fetch` and check exact variables/idempotency/error handling. Client and staff UI
tests exercise the reset screen without email delivery.

After the user explicitly authorized one email to their own address, the real
forgot-password HTTP flow was exercised against a disposable database. Resend
accepted that single message and returned an email ID; the recipient confirmed inbox delivery. The disposable account/database were removed.
Live idempotency was not tested because only one send was authorized. The default
test sender has not been replaced with a verified project-domain sender.

Official setup references used: [Resend setup](https://resend.com/setup.md),
[Node SDK](https://resend.com/docs/send-with-nodejs), and
[idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

Verification at implementation: 28 auth unit/database/SDK tests, 13 auth HTTP tests,
69 client tests, 20 staff browser tests and 15 targeted Spring security tests passed.
A real local HTTP flow with a simulated sender also covered signup, mandatory
setup, logout, reset, retained MFA and recovery-code login. Schema/seed reruns
preserved eight unenrolled development identities. Auth/client/staff builds passed;
Angular retained its existing bundle/style budget warnings. These checks do not
establish inbox delivery or deployment readiness; the separately authorized live
test established provider acceptance only.

## Missing-email investigation and recovery UX correction

For the reported request, the running service queued a job and Resend accepted it
with no recorded delivery error. The sending-only key cannot read provider delivery
status (Resend returns `restricted_api_key`), so inbox delivery for that request is
not established. Check Spam and the message's status in the Resend Emails dashboard;
provider acceptance alone does not prove delivery. No additional test email was sent
while investigating this report.

A separate retry bug was fixed: cooldown requests previously returned a fresh opaque
token without a corresponding email/job. They now return an explicit cooldown error
and preserve the usable original challenge. Password recovery now uses three visually
separate steps and removes the unrelated login slogan while recovery is open.

Recovery correction verification: 31 auth unit/database/SDK tests, 14 HTTP-boundary
tests, 69 client tests and 20 staff browser tests passed. Desktop and 390-pixel
mobile browser inspection confirmed that password fields appear only after code
verification, that the heading and status notice do not overlap, and that the page
has no horizontal overflow. The auth migration preserves existing identities,
password hashes, authenticator enrollments and financial data.

The tested auth migration and client/staff UI images were applied to the running
local stacks. Readiness and proxy checks confirmed the new verification endpoint
and rejection of the old combined request. No real password was changed and no
additional email was sent while applying the fix.
