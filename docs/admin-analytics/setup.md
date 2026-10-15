# Setup and verification

Run commands from the repository root. Java builds require Java 25 and Maven.
Docker Compose must support the modern Compose specification (the isolated test
override also uses `!reset`). The normal staff stack uses no test fixture data.

## Start the existing trading stack

Use the existing root `.env` and `docker compose up -d --build`. The staff API
reuses its auth issuer/audience/JWT secret and connects to the existing
`trading_platform_network`. Client endpoints remain on port 8082; the internal API
runs on 8085. Nginx routes `/api/v1/admin/` and `/api/v1/analytics/` to the internal
service and the remaining client APIs to the trading service.

For an **existing trading database**, apply the current schema explicitly. Restart
alone does not execute PostgreSQL initialization SQL:

```bash
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < DB/endgame_db.schema.sql
```

This creates audit/outbox tables and triggers and backfills the linked cash ledger
from existing fills/transactions. It does not reset balances, orders or holdings.
The publisher needs this migration before it can start. Rebuild/restart the trading
backend after migration so quote evidence and JWT-protected admin commands are active.

## Configure the separate staff stack

```bash
cp docker/admin-analytics/.env.example docker/admin-analytics/.env
```

Fill the blank passwords/secrets. The two env files are intentionally separate:
root `.env` supplies existing trading/auth settings; the staff env file supplies
its database, ETL and Superset settings. Generate secrets independently, for example
with `openssl rand -hex 32`. Do not commit the populated files.

```bash
docker compose --env-file .env --env-file docker/admin-analytics/.env \
  -f docker/admin-analytics/admin-analyst-stack.compose.yml up -d --build
```

The first startup initializes the reporting schema, separate component logins and
Superset metadata database. It does **not** seed `admin_analytics_db_test_data.sql`.
Superset initialization creates three prepared dashboards and saves their embedded
UUIDs in the dashboard registry. The publisher snapshots existing records, then
publishes ongoing outbox events. The consumer and 7 PM scheduler run continuously.

| URL | Purpose |
|---|---|
| `http://localhost:8085/swagger-ui/index.html` | Internal API documentation |
| `http://localhost:8086` | Simple admin/analyst test UI; sign in with an existing staff account |
| `http://localhost:8088` | Superset authoring; use the configured dashboard-author account |
| `http://localhost:8084/api/v1/analytics/status` | Authenticated status through Nginx |

The [simple test UI](../../internal-frontend/README.md) provides audit lookups,
commands and embedded dashboards now. The final Angular staff pages remain the
frontend teammate's work. `ADMIN_FRONTEND_TODO.md` and the [API contract](frontend-api.md)
provide the handoff. Existing auth development fixtures include staff roles; for
other users, assign roles through a trusted auth administration process. Signup
always creates a client. A refreshed/login token must carry `ADMIN` or `ANALYST`.

For an existing staff env file, append `http://localhost:8086` (and
`http://localhost:5174` for Vite development) to `SUPERSET_EMBED_ORIGINS`, then run
the build/start command again. The updated initializer refreshes existing
dashboard allowlists, and the Superset web container uses the matching frame policy.

If you previously used the root Compose `admin-db`, stop its old
`endgame_admin_db` container before starting this stack; otherwise it may still
occupy port 5434. Its old volume is retained but is not automatically imported into
this new Compose project. The new reporting store can be rebuilt from source facts.
Historical hand-entered demo rows are not copied. Do not delete old volumes if you
need their contents.

## Operations

Use the same `--env-file` and `-f` arguments above for each command below:

```bash
# Inspect services/logs (never print rendered Compose config containing secrets).
docker compose --env-file .env --env-file docker/admin-analytics/.env \
  -f docker/admin-analytics/admin-analyst-stack.compose.yml ps

# Rebuild a particular day's report, after that day's 7 PM cutoff.
docker compose --env-file .env --env-file docker/admin-analytics/.env \
  -f docker/admin-analytics/admin-analyst-stack.compose.yml run --rm reporting-job report --date 2026-10-01

# Reimport the source snapshot if needed; event/fact IDs prevent duplicate effects.
docker compose --env-file .env --env-file docker/admin-analytics/.env \
  -f docker/admin-analytics/admin-analyst-stack.compose.yml run --rm publisher backfill

# Apply an updated reporting schema to existing storage (no reset).
docker compose --env-file .env --env-file docker/admin-analytics/.env \
  -f docker/admin-analytics/admin-analyst-stack.compose.yml exec -T reporting-db \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < DB/admin_analytics_db.schema.sql
```

The pipeline stops on an invalid message and retries it after restart. Inspect the
source event and destination schema when this happens; do not skip the Kafka offset
to hide the error. A reporting failure preserves the previous successful batch.
The scheduler retries at 30-second intervals. Missed previous dates can be generated
with the explicit `report --date` command.

Superset bootstrap preserves existing chart layouts. To change author/service
passwords on an initialized instance, update the account through Superset's trusted
administration tools; changing an env value alone does not rotate an existing hash.
The database login initialization scripts likewise run only on an empty volume.

## Tests

```bash
# Both Java projects, including JWT/role enforcement. Use a test-only secret.
mvn test -DJWT_SECRET=test-only-secret-at-least-thirty-two-characters

# Staff backend alone; no trading source, build or credentials needed for its tests.
mvn -f internal-backend/pom.xml clean package

# Trading regressions and actual SQL validation, using a disposable database.
python3 scripts/run-backend-postgres-tests.py

# Build the Python image, then test projection, replay, rounding and 7 PM/DST.
docker build -t asset-analytics-pipeline:poc admin-analytics/pipeline
python3 scripts/verify-admin-analytics.py

# Build the independent staff service for the isolated full-stack test.
docker build -t asset-internal-backend:poc internal-backend
docker build -t asset-internal-frontend:poc internal-frontend
docker build -t asset-analytics-superset:poc admin-analytics/superset
python3 scripts/verify-admin-stack.py

# Optional browser check against the real, disposable stack (Linux Docker host).
# First install the UI's npm dependencies and Playwright Chromium; see its README.
python3 scripts/verify-admin-stack.py --browser
```

The database verification scripts create and remove only their own temporary
databases. The full-stack runner generates temporary secrets and starts a unique
Compose project with a fresh source database; it does not connect to live trading
storage. It verifies source changes through Kafka, exact reporting totals, real
staff JWT authorization, quote/timeline APIs, restricted guest tokens and a real
Superset chart-data query, then removes its own containers and volumes.
