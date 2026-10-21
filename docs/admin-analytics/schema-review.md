# Reporting database schema review

Reviewed 20 October 2026 against the SQL schema, Python publisher/consumer/report worker, staff Spring API, and saved Superset dataset registrations in the running local installation.

## Findings

The application reporting database currently has **20 tables and 19 views** across `public`, `admin`, `reporting`, `analytics`, `audit`, and `integration`. Views are saved queries, not extra stored copies of all their results. Counting them as duplicate tables makes the database appear larger than it is.

Most tables serve distinct purposes and should remain. The largest clarity problems are ambiguous order/trade naming, raw copied tables remaining in `public`, and an inactive monthly reporting proposal sitting alongside working reporting features.

This review proposes names and migration boundaries; it does not rename or drop objects. A rename must update SQL writers, readers, grants, triggers, tests, documentation and saved Superset datasets together. Do not use `DROP ... CASCADE` to clean this up.

## Table decisions

| Existing table | What it actually stores / current use | Decision |
| --- | --- | --- |
| `public.client_accounts` | Copied cash, client/account IDs, admin email, suspension, timestamps; consumer writes, admin/portfolio views read | Keep; group under a clearly named copy schema |
| `public.client_positions` | Current copied share quantities by account/instrument | Keep; `client_holdings` would be clearer |
| `public.instruments` | Copied instrument catalogue and availability | Keep |
| `public.trade_records` | Original known order terms, including orders that never fill; consumer writes; evidence/report readers use | Keep; rename to `order_records` |
| `public.trade_lifecycle_events` | Recorded order status transitions, fill evidence and failed attempts | Keep; rename to `order_events` |
| `public.cash_holding_changes` | Deposits, withdrawals, dividends and trade cash/share deltas | Keep; rename to `account_movements` |
| `public.admin_audit_log` | Staff view audits plus copied source administrative actions | Keep; `staff_audit_events` is clearer about actors and row contents |
| `public.monthly_client_segments` | Proposed historical month-end portfolio/activity classifications | Retirement candidate: no production writer, zero rows in this installation |
| `audit.order_state` | Latest order status, including state changes not fully reconstructed in event history | Keep; `current_order_status` is clearer |
| `audit.ingested_events` | Original Kafka envelopes and event UUID deduplication | Keep; protects replay correctness and preserves ingestion evidence |
| `audit.pricing_evidence` | Actual quotes and decisions used during submission/execution | Keep; `order_pricing_evidence` would clarify scope |
| `integration.pipeline_status` | Heartbeat/freshness and last received event | Keep; used by UI and report readiness checks |
| `integration.report_schedules` | Effective-dated schedule settings and their history | Keep; prevents reinterpreting historical report cutoffs |
| `integration.report_batches` | Each report build attempt, boundaries, status, failure and completion | Keep; `report_runs` is a plainer name |
| `integration.published_reports` | Selected successful batch for each date | Keep; publication pointer, not a duplicate report body |
| `integration.dashboard_registry` | Approved dashboard keys and embedded UUIDs | Keep; used by staff API and Superset initialization |
| `integration.report_requests` | Manual report work queue, requester and result | Keep; different from a worker's build attempts |
| `analytics.trade_facts` | Immutable trade rows per report version | Keep; `report_trade_facts` would clarify the batch boundary |
| `reporting.client_directory` | Names associated with client UUIDs | Keep; names/search/joins use it |
| `reporting.instrument_marks` | Latest observed provider valuation prices and quote timestamps | Keep; `latest_market_prices` is easier to understand |

Recommended first rename set: `trade_records` → `order_records`, `trade_lifecycle_events` → `order_events`, `cash_holding_changes` → `account_movements`, `order_state` → `current_order_status`, `instrument_marks` → `latest_market_prices`. Do not rename everything merely for consistency; each migration adds coordination cost.

## Why apparent duplicates are needed

- Accounts versus movements: one answers “what cash is recorded now?”, the other “what changed it?”.
- Holdings versus movements: one answers “how many shares now?”, the other records changes over time.
- Order records versus order events versus current status: original known terms, a timeline, and latest operational state have different meanings.
- Ingested envelopes versus pricing evidence: the first deduplicates delivery and preserves original payloads; the second provides an indexed order-focused investigation model.
- Movements versus report trade facts: the first is continuous copied source history; the second freezes reconciled report versions. They must not be added together as separate transactions.
- Requests versus report runs versus published pointers: requested work, execution attempts, and the version currently visible to readers are separate states. Combining them would complicate retries and published-version preservation.

## Inactive monthly feature

The following objects form one inactive group:

- Table `public.monthly_client_segments`.
- Views `reporting.monthly_segment_activity`, `reporting.monthly_exec_summary`, `reporting.monthly_client_classifications`.

No current production job writes the table. It contained zero rows during this review. The registered local Superset dataset was only `analytics.named_published_trades`; these monthly views were not registered datasets. That does not prove nobody has external SQL, a saved ad hoc query, or another installation depending on them.

Recommendation: deprecate this group in the documentation/catalog now. Retire it through an explicit migration after confirming historical monthly reporting is outside the agreed scope and checking other deployments/external consumers. If historical reporting is required, implement real cutoff valuations and the activity classification rules instead. Current A/B/C portfolio classes do not replace month-end history.

An empty table is not automatically pointless. For example, a pending work queue can legitimately be empty. This monthly table is a candidate because it has neither a current writer nor a currently working feature consuming populated data.

## Older live reporting views

Keep `reporting.fills`, `reporting.daily_trading_volume`, `reporting.daily_instrument_activity`, and `reporting.instrument_activity(from,to)` unless live copied activity reporting is deliberately retired. They aggregate live copied facts rather than scheduled published batches. Their names should eventually carry `live_` or `copied_` to distinguish them from published reports. They do not store another set of financial rows.

`admin.trade_timeline` is used by `AdminLookupRepository`; it is not safe to remove merely because the newer evidence endpoint also reads underlying events directly.

## Columns with no current writer

- `cash_holding_changes.cash_balance_after` and `holding_quantity_after`: the consumer does not populate them, and no non-null values were present in this installation. Staff DTOs/views still expose them. Keep them nullable until the API contract is changed or a real source snapshot is recorded. Do not manufacture historical after-balances from today's account balance.
- `admin_audit_log.request_id`: the current writer does not supply it, although PDF export selects it. Either implement request correlation or retire the column in a coordinated API/export migration. Its existence does not currently mean requests are traceable by that ID.
- `admin_audit_log.metadata`: current direct view-audit writes use the default empty object. Exports read it. Treat it as an extension point, not evidence that additional context is already captured.

## Proposed organization

| Schema | Responsibility |
| --- | --- |
| `trading_copy` (proposed) | Current copied client accounts, holdings, instruments, order status and observed market prices |
| `audit` | Permanent order records/events, account movements, pricing evidence, staff audit and ingested envelopes |
| `integration` | Pipeline status, schedules, manual requests, report runs, publication pointers and dashboard registration |
| `analytics` | Versioned report trade facts and published report summaries |
| `reporting` | Analyst-safe client directory, portfolio valuations/classes, live activity views and database dictionary |
| `admin` | Ultron's joined account/order/evidence read models |

Move raw copied state and permanent facts out of `public` in a planned migration, keeping browser-facing API fields stable. PostgreSQL tracks many view dependencies through table renames, but application SQL strings do not update themselves. In particular, legacy compatibility views cannot replace write targets that depend on `INSERT ... ON CONFLICT`; the consumer must write to the real renamed table.

Migration order: capture dependencies and backup; update idempotent schema/migration and all code references; verify existing-data upgrade plus fresh installation; run pipeline/replay/reconciliation, staff API/PDF, and Superset filter checks; deploy coordinated versions; retire old aliases only after external consumers have moved. Preserve append-only triggers, grants, IDs and historical records throughout.
