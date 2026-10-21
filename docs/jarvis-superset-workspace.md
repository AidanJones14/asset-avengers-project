# J.A.R.V.I.S.: automatic Superset sign-in and authoring

The analyst portal previously named Friday is now **J.A.R.V.I.S.** Its URL stays
`/analyst` (Reports: `/analyst/reports`), so bookmarks and role routing continue to work.

## What an analyst does

1. Sign in to J.A.R.V.I.S. with the existing email/password and authenticator or recovery code.
2. On Reports, click **Open Superset workspace ↗**. Allow the new tab if the browser asks.
3. Superset opens SQL Lab automatically; there is no second username/password prompt.
4. Select **Asset Avengers analytics**, write a SELECT/JOIN, and save it as a
   virtual dataset. Use Explore to build charts and save your own dashboards.

Each analyst gets a separate Superset user named `endgame_<auth UUID>`, with their
auth-owned first/last name and email. UUIDs determine ownership; matching email
addresses never attach an existing Superset account. An email collision needs an
administrator to resolve it. Native Superset administrator login remains available
for maintaining Superset. The former shared `friday-author` demo account is disabled.

## How the handoff works

- The staff frontend rotates its refresh token through its existing shared refresh
  promise, then requests `POST /auth/superset/ticket` with that refresh token.
- NestJS checks the live session, MFA verification, expiry, revocation, and current
  ANALYST role. It returns a random, single-use ticket valid for 60 seconds.
- A form POST sends only that ticket to Superset's `/endgame/sso` in the new tab.
  Passwords, application JWTs, refresh tokens and tickets never enter the URL.
- Superset validates the browser Origin against `SUPERSET_EMBED_ORIGINS`, then
  redeems the ticket through the server-to-server `/auth/superset/exchange` API.
  A separate `SUPERSET_SSO_SECRET` authenticates Superset to NestJS.
- Auth consumes the ticket under a row lock and returns the verified UUID identity
  plus an opaque session lease. Superset creates/updates the individual author and
  establishes its normal HttpOnly session cookie.
- On subsequent SSO-authenticated Superset requests, the server validates the lease
  through `/auth/superset/session`. Logout, password-change/reset session revocation,
  account deletion, idle/absolute expiry, or removal of the ANALYST role blocks the
  next protected request. A failed auth backchannel also fails closed.

This is a custom session handoff, not an OAuth/OIDC identity provider. It does not
copy passwords into Superset or disable MFA. Existing embedded guest-token viewing
continues separately. Signing out of Superset alone does not sign out of J.A.R.V.I.S.;
clicking its workspace button again starts a fresh handoff. J.A.R.V.I.S. logout
revokes the auth session and therefore the associated Superset lease.

## Permissions and storage

Managed users receive `Alpha`, `sql_lab`, and `ReportingSqlAuthor` roles, never Admin
or GuestTokenIssuer. The reporting connection is exposed in SQL Lab; DML, CTAS,
CVAS, and file uploads stay disabled. Its PostgreSQL `superset_reader` role has
read-only grants. No live trading or auth database connection is added to Superset.

`superset_sso_grants` in the auth database stores SHA-256 ticket/lease hashes, a session FK, expiry,
and consumption time. It is not replicated through Kafka or reporting. Superset
metadata stores individual users, password hashes for inaccessible random native
passwords, roles, saved queries, datasets, charts, and dashboards. Auth remains the
source of staff identity and MFA proof; live session checks enforce revocation.

## Configuration and deployment

Only the root `.env` is used. Set a stable shared secret (at least 32 characters):

```dotenv
SUPERSET_SSO_SECRET=your-private-random-server-secret
```

Generate it with `openssl rand -hex 32`. The local file has been provisioned; the
example file contains no secret. The value is passed only to auth-server and
Superset/init, never to either frontend or the reporting database. Former
`SUPERSET_ANALYST_USER/PASSWORD` settings are no longer needed.

Run `bash scripts/start-project.sh --all` to apply the additive auth schema and
rebuild services. Superset joins the trading Docker network to reach auth-server
through `ENDGAME_AUTH_URL=http://auth-server:3000`. The standard administrator and
backend guest-token service credentials retain their existing purposes.

With `SUPERSET_PUBLIC_URL=auto`, workspace URLs follow the staff request hostname
and `SUPERSET_PORT` (8088 by default). For a Linux VM, configure its actual staff
origin in `SUPERSET_EMBED_ORIGINS` and allow its Superset port through the bind and
firewall settings. Use HTTPS and secure cookies when deploying behind TLS. The
SSO route is the only CSRF exemption; it validates the exact configured Origin and
requires a fresh ticket. It rejects missing/untrusted origins and arbitrary redirect
paths. The regular Superset APIs retain their CSRF protections.

## Example JOIN and chart

```sql
SELECT p.report_date, p.executed_at, p.client_id,
       COALESCE(NULLIF(TRIM(d.full_name), ''), 'Unknown client') AS client_name,
       p.symbol, p.order_side, p.quantity, p.price, p.cash_amount
FROM analytics.published_trades AS p
LEFT JOIN reporting.client_directory AS d ON d.client_id = p.client_id;
```

Use `published_trades`, not raw `trade_facts`, to avoid counting rebuilt batch history
more than once. This JOIN reads rows without changing the tables. Names are current
copied directory labels, not historical snapshots. If no report has been published,
generate a daily report in J.A.R.V.I.S. first.

Save as a virtual dataset, create a bar chart grouped by `symbol`, and use
`SUM(cash_amount)` for gross traded notional. That metric is neither revenue nor
profit. Add native filters for `report_date`, `client_name`, `symbol`, or `order_side`
and explicitly scope them to compatible charts. Custom dashboards stay in Superset's
Dashboards menu; saving one does not automatically register it in the portal's list
of prepared embedded dashboards.

The authoring link does not itself enlarge the embedded viewer or repair existing
filter scopes. See [Superset roles](https://superset.apache.org/docs/6.0.0/security/).

## Verification

Validated 112 tests: 48 auth unit/PostgreSQL tests, 16 HTTP boundary tests, 25 staff
browser tests, 16 staff backend tests, and 7 Superset Flask route tests. The popup
POST retains the trusted source Origin and puts no ticket in the URL. Tests cover
concurrent redemption/replay, expiry, client/password-only rejection, missing client
secrets, role removal, account isolation, and session revocation.

A live temporary analyst completed real TOTP enrollment, opened Superset through
the handoff without a second password, received a UUID-linked account, failed to
reuse the ticket, and lost Superset access after J.A.R.V.I.S. logout. Both temporary
identities were removed afterward. No reset emails or trading actions were used.
