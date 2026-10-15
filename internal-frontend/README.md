# Simple admin and analyst test UI

The name `internal` means staff-facing: this is the shared admin/analyst UI.
This is a small standalone HTML/JavaScript console for exercising the staff APIs.
It is separate from the client Angular app and can be replaced by the team's final
staff frontend. It always uses API data; example records exist only in tests.

## Run with Docker

First follow the [staff stack setup](../docs/admin-analytics/setup.md), including
the source database migration and shared root `.env` configuration. Start the existing root
Compose stack so the authentication and trading services are available. Then:

```bash
docker compose --env-file .env \
  -f deployment/admin-analytics/admin-analyst-stack.compose.yml up -d --build
```

Admin login: **http://localhost:8086/admin.html**.
Analyst login: **http://localhost:8086/analyst.html**.
Each page accepts its matching staff role. The root URL has no shared entry page. The local auth fixtures are documented in `DB/auth_db_test_data.sql`;
normal registration creates a client and does not grant staff access. You can also
expand **Use an existing access token** to paste a valid staff JWT.

When the local auth fixtures are installed, use `alice.admin@example.com` for admin
testing or `charlie.analyst@example.com` for analyst testing. Their development-only
password is `EndgameDemo123!`.

If port 8086 cannot be reached, start the staff stack with the command above.
The root `docker compose up` starts the client stack; the staff UI belongs to the
separate Compose file. Check its status with:

```bash
docker compose --env-file .env \
  -f deployment/admin-analytics/admin-analyst-stack.compose.yml ps
```

`internal-frontend` should be healthy and publish `127.0.0.1:8086->80/tcp`.
Use the corresponding `/admin.html` or `/analyst.html` address on the machine running Docker. If the IDE runs on a
remote machine, forward port 8086 to your browser's machine.

In the root `.env`, add `http://localhost:8086` to
`SUPERSET_EMBED_ORIGINS` before rebuilding the stack. Add `http://localhost:5174`
for Vite development. Preserve any other origins your teammates use. Superset's
initializer updates the existing dashboards' allowed origins without replacing
their layouts. Restarting an old Superset image alone does not update this setting.

## What to test

| Section | Access | Checks |
|---|---|---|
| Orders | ADMIN | Filter/paginate orders, inspect lifecycle and actual quotes, download audit JSON |
| Clients | ADMIN | Search email, inspect cash, positions and recorded movements |
| Actions | ADMIN | Suspend/unsuspend an account or instrument with a reason; read recent staff activity |
| Reports | ADMIN or ANALYST | Source freshness, latest attempted/published batches, embedded Superset dashboards |

Actions submit real trading commands. To try one, use a development account or
instrument UUID, provide a reason, and click **Apply action**. Read views may lag
briefly behind the source update. API permissions remain authoritative; hiding a
navigation button does not grant or revoke backend access.

Reports cover midnight through 7 PM America/New_York on the report date. No report
before the first successful batch is a normal empty state. **Refresh status** checks
freshness; detail views load only on demand because viewing them writes an audit log.

Tokens stay in browser memory and are cleared on sign-out. Reloading the page
requires another sign-in. Password login supports a single shared refresh request
when API calls expire together; a pasted access token cannot be refreshed.

## Run without rebuilding Docker

With the APIs running, from this folder:

```bash
npm ci
npm start
```

Open **http://localhost:5174**. Vite proxies staff APIs to port 8085 and auth to
port 3000. Override `INTERNAL_API_URL` or `AUTH_API_URL` when using different local
ports. In Docker, Nginx proxies those same paths to the service names. Superset's
public URL must be reachable by the browser (default `http://localhost:8088`).

## Code and verification

- `admin.html`, `analyst.html`: separate role-specific login documents and workspaces.
- `src/app.js`: rendering, searches, commands, downloads and dashboard lifecycle.
- `src/api.js`: authenticated API calls and refresh-token rotation.
- `src/style.css`: responsive styles.
- `nginx.conf`, `Dockerfile`: standalone serving and API proxy configuration.

```bash
npm run build
npx playwright install chromium
npm test
```

The six browser tests use isolated API fixtures to cover admin/analyst/client
roles, refresh races, exports, commands, errors and mobile layout. They do not
change live accounts. To check the actual Nginx proxy and Superset iframe too,
build all four staff images as described in the setup guide, then run from the root:

```bash
python3 scripts/verify-admin-stack.py --browser
```

This optional browser check needs local Node dependencies and Chromium installed
above, and a Linux Docker host with reachable container bridge addresses. It uses
temporary credentials/data and cleans up its own stack. It does not test real
password login against your existing auth database; password-login behavior is
covered by the browser fixtures and the auth service's own tests.

Embedding follows the official
[Superset SDK workflow](https://superset.apache.org/user-docs/using-superset/embedding/):
the browser requests guest tokens from our backend, never Superset service credentials.

Both roles can download published report PDFs. Admin can additionally download
order-audit PDFs and date-filtered staff-activity PDFs. Downloads are authenticated,
server-generated documents rather than browser printouts. See the
[PDF setup/usage notes](../docs/admin-analytics/setup.md#pdf-downloads).
