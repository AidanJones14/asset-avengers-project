# Database reference

Read this alongside [the project guide](../docs/project-guide.md). Database names
are configurable; the names below are the local defaults. Host ports are for
tools running outside Docker. Containers use service names and port 5432.

## Ownership and connections

| Database | Docker service / host port | Writer | Readers and purpose |
|---|---|---|---|
| `auth` | `auth-db` / 5433 | Nest auth service | Auth repositories validate credentials, sessions and token rotation |
| `endgame_test` | `postgres` / 8083 | Trading API; SQL triggers; publisher marks outbox delivery | Trading JPA repositories and publisher snapshots/outbox |
| `admin_analytics` | `reporting-db` / 5434 | Consumer, report job; internal API appends view audits; initializer registers dashboards | Internal API investigates clients/orders; Superset reads approved views |
| `superset_metadata` | Same reporting PostgreSQL instance | Superset migrations, initializer and web app | Superset manages its users, chart definitions, dashboard layouts and permissions |

The internal API has no trading database credentials. Its suspension commands go
through the trading HTTP API with the original staff JWT. Superset metadata is
managed by Superset migrations, not by a hand-written application schema here.

## Files and when to use them

| File | Purpose and behavior |
|---|---|
| `auth_db.schema.sql` | Creates credentials/session tables; fresh auth storage loads it automatically |
| `auth_db_test_data.sql` | Eight development credential fixtures, including admin/analyst roles; no funded portfolios |
| `endgame_db.schema.sql` | Authoritative trading DDL, incremental additions, constraints, triggers and historical cash-ledger backfill |
| `instruments.seed.sql` | Canonical catalogue of 100 tickers with stable UUIDs; metadata only, no prices or client holdings |
| `endgame_db_test_data.sql` | Generated copy of the catalogue for legacy setup/test consumers; regenerate from the canonical seed |
| `admin_analytics_db.schema.sql` | Reporting mirrors, audit facts, report batches, views and capability roles |
| `admin_analytics_db_test_data.sql` | Standalone reporting fixtures for schema/API tests; normal staff Compose startup does not load them |
| `admin_analytics_db_app_user.sh` | Older single-login initializer; retained for older setups, replaced in current staff Compose by `deployment/admin-analytics/init-databases.sh` |
| `docker-compose-proddb.yml` | Separate database-container configuration; does not provision the complete app or apply these schemas automatically |

Initialization SQL runs only when PostgreSQL storage is empty. Restarting a
container preserves data and does not reapply edited SQL. Use the migration
commands in [staff setup](../docs/admin-analytics/setup.md) for existing databases.
`IF NOT EXISTS` prevents duplicate objects; it is not a substitute for explicit
`ALTER` statements when changing an existing definition. The trading schema's
backfill copies immutable facts into `cash_ledger` without changing balances.

`python3 scripts/generate-instrument-seed.py` synchronizes the catalogue fixture;
`--check` verifies it. `setup-test-db.sh` applies trading schema/catalogue to the
local database; its explicit `--reset` option is destructive. The verification
scripts create disposable databases instead; see [the code map](../docs/code-map.md).

## Auth tables

| Table | Relationships and reason |
|---|---|
| `users` | UUID is JWT `sub` and the logical trading user ID; email is unique, password is a bcrypt hash, default role is CLIENT |
| `sessions` | Many logins per user; FK to users; independent idle and absolute expiry plus revocation |
| `refresh_tokens` | SHA-256 hash primary key; FK to session; `used_at` detects replay of a rotated token |

Deleting an auth user cascades to its auth sessions/tokens. There is no
cross-database cascade into financial records. The trading service lazily creates
its user row from the verified JWT UUID. Auth owns the role claims used for API
authorization; editing a reporting mirror does not grant application permissions.

## Trading tables

| Table | Owner, relationships and reason |
|---|---|
| `users` | `CurrentUserService` bridges verified auth UUID to local trading identity; contains no password |
| `accounts` | FK to trading user; authoritative cash/suspension; account row locks serialize competing cash commitments |
| `bank_accounts` | FK to user; links simulated funding sources; responses mask account numbers, but stored values are not encrypted |
| `instruments` | Shared catalogue; unique symbol; currency, security class and eligibility are checked before trading |
| `watchlists` | One list per user; FK to user; survives logout |
| `watchlist_items` | FKs to list and instrument; unique pair makes repeated starring idempotent |
| `orders` | FKs to account/instrument; mutable operational terms/status, cash reservation and finalization time |
| `trade_fills` | One immutable full fill per order; stores quantity, actual execution price and rounded cash amount |
| `transactions` | Immutable non-order cash events: deposit, withdrawal or dividend; account FK and optional instrument |
| `holdings` | Current quantity, unique per account/instrument; can change as new fills execute |
| `order_audit_events` | Immutable submitted/rejected/filled facts linked to an order; source lifecycle used by staff |
| `order_pricing_evidence` | Immutable actual quote JSON with phase, outcome and observation time; failed attempts survive execution rollback |
| `cash_ledger` | Unified signed cash/share movement; movement UUID is original fill/transaction UUID, enabling replay-safe backfill |
| `staff_audit_events` | Staff UUID/email, target and reason written in the transaction that changes suspension state |
| `audit_outbox` | Durable event envelope plus delivery timestamp; inserted within source transactions and delivered asynchronously |

Money uses SQL `NUMERIC` and Java `BigDecimal`. Cash settles to two decimals;
quantity and execution price use four. Buys round cost upward and sells round
proceeds downward. Reports use the recorded cash amount, not a second multiplication
that might round differently. Account cash and holdings are current balances;
fills/transactions/ledger entries explain how they changed.

There is deliberately no order FK on `order_pricing_evidence`: an invalid execution
quote commits in a separate transaction while the caller holds the order lock.
An FK check could wait on that same uncommitted order operation. This design
requires the application to supply the correct order UUID; evidence is not proof
that an order filled. A submission quote, when present, commits with its order.

### Trading triggers and constraints

| Mechanism | Why it exists |
|---|---|
| `set_updated_at`, account-touch triggers | Keep source freshness visible when orders, cash events or positions change |
| `prevent_staff_account`, `prevent_staff_role_with_account` | Keep staff identities separate from client trading accounts |
| Uniqueness and numeric/status checks | Reject duplicate positions/fills/stars and invalid financial state even outside Java |
| Fill/transaction mutation blockers | Prevent editing/deleting recorded financial facts |
| `record_order_lifecycle` | Emit submitted at insertion and terminal filled/rejected transitions without requiring every writer to remember them |
| `record_cash_ledger` | Link actual fill/transaction UUIDs to signed cash/share changes |
| `enqueue_audit_change` | Copy allowed source changes and relevant order/account/instrument context into outbox atomically |
| Audit mutation blockers | Reject update, delete and truncate on source audit facts |

The extraction allowlist excludes bank account details and the entire auth
database. Outbox payloads do include trading client emails for authorized admin
lookup. A single partition preserves Kafka stream order in this POC; it does not
turn SQL sequence allocation into a guaranteed global commit order.

## Reporting tables and views

| Object | Writer and consumers |
|---|---|
| `client_accounts`, `client_positions`, `instruments` | Consumer updates current mirrors; source timestamps stop older state from overwriting newer state |
| `trade_records` | Consumer inserts original order terms once; amendments are not reconstructed here |
| `trade_lifecycle_events` | Consumer appends recorded lifecycle and known snapshot states; `terminal` and `provenance` distinguish failed attempts/imports |
| `cash_holding_changes` | Consumer copies source movement IDs and actual deltas; unknown after-balances remain null |
| `admin_audit_log` | Internal API appends detail-view audits; consumer copies staff command audits from trading |
| `monthly_client_segments` | Legacy proposed month-end segmentation; no current production job populates it |
| `audit.order_state` | Consumer's mutable current status, including changes outside the dedicated lifecycle audit scope |
| `audit.ingested_events` | Original envelopes; event UUID deduplicates an entire destination transaction |
| `audit.pricing_evidence` | Original quote observations and failures; staff timeline/pricing/export endpoints read them |
| `integration.pipeline_status` | Last consumed source heartbeat, receipt and event; drives UI freshness and report readiness |
| `integration.report_schedules` | Append-only shared cutoff/run-time versions, actor and effective local date; default 19:00 |
| `integration.report_batches` | Every running/published/failed attempt, coverage boundaries and heartbeat |
| `integration.published_reports` | One chosen batch per date; switched only after successful reconciliation |
| `integration.dashboard_registry` | Initializer maps approved UI keys to Superset embedded UUIDs; API reads it |
| `analytics.trade_facts` | Immutable batch/fill facts; repeated builds retain prior versions |

`admin.client_accounts`, `admin.client_positions`, `admin.client_cash_history`,
`admin.trades`, `admin.trade_timeline` and `admin.audit_log` join reporting facts
into staff lookup shapes. The enhanced timeline endpoint reads original event
fields directly to preserve `terminal` and `provenance` information.

`analytics.published_trades` joins facts to the published pointer. The business,
instrument and client activity views aggregate those published facts. Superset's
prepared dataset uses `published_trades` so failed/incomplete/replaced batches
cannot be added together accidentally.

The older `reporting.fills`, daily-volume and daily-instrument views and
`reporting.instrument_activity(from,to)` aggregate copied lifecycle facts
directly, without a published-batch cutoff. Monthly views depend on
`monthly_client_segments`, which remains unpopulated in the normal stack. These
compatibility views are not the source of the prepared scheduled dashboards.

The consumer writes the deduplication row and all projections in one transaction,
then commits the Kafka offset. The publisher marks delivery only after Kafka
acknowledges. A crash between either pair of steps causes a replay, so stable
event/movement IDs are essential. Snapshot imports identify known state as
`provenance=snapshot`; missing historical quotes or steps are never invented.

### Database roles versus application roles

| Database capability role | Used by | Permissions |
|---|---|---|
| `analytics_etl` | Consumer and report job | Maintain mutable mirrors/status, append immutable facts and audit copies, publish report pointers |
| `analytics_admin` | Internal API login | Read reporting/audit objects; append `admin_audit_log` view entries and report-schedule versions |
| `analytics_analyst` | Superset reporting login | Read approved `reporting` and `analytics` views; no client-email mirror or admin log access |
| Separate metadata owner | Superset | Manage its own metadata database |

These PostgreSQL roles are not JWT roles. `ADMIN` and `ANALYST` are checked by
Spring before API access; both use the internal service's configured connection.
Initializers create deployment logins with these capability memberships. Changing
an env password after initialization does not rotate the already-created DB role.

## Reports and recovery

Reports cover [00:00, configured cutoff) America/New_York on the selected date
(default 19:00), using recorded
execution time. `ZoneInfo` accounts for daylight saving changes. After-cutoff
trades remain in audit; they do not move into tomorrow's report. A failed batch
keeps the prior published pointer intact; a successful manual rerun creates a
new batch. The heartbeat is a POC freshness check, not proof of distributed
transaction completeness.

See [staff operations](../docs/admin-analytics/setup.md#operations) for reruns and
reimport commands. Keep source trading records when rebuilding reporting storage.
Backfill cannot recreate quotes/events that predate their capture. Do not treat
container restart or deleting volumes as a migration strategy.

Report-schedule changes are saved through the staff API and become effective the
next New York day. Only SELECT/INSERT are granted on schedule history; triggers
block updates, deletes and truncation. Historical reports retain their cutoff.
Reapply the canonical reporting schema for existing databases before deploying the
new API/worker. No client trading, auth or instrument seed changes are needed.
