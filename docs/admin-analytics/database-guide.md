# Admin and analyst database guide

Ultron and J.A.R.V.I.S. share the reporting database (`admin_analytics` by default). This is separate from the auth database and the live trading database. They have different read permissions within it. The database is organized into schemas (folders of database objects); a view is a saved query, not another copy of the same records.

| Schema | Contains | Start with |
| --- | --- | --- |
| `public` | Internal source mirrors and permanent copied trading history | Prefer the staff views below |
| `admin` | Ultron views of accounts, positions, cash history, orders, order timeline and staff audit | `admin.client_accounts`, `admin.trades`, `admin.trade_timeline`, `admin.audit_log` |
| `reporting` | Client names, current portfolio valuation/classification, daily trading summaries and legacy monthly summaries | `client_directory`, `client_portfolios`, `database_guide` |
| `analytics` | Immutable batch-specific trade facts and views of published report versions | `named_published_trades`, `business_overview`, `client_activity`, `instrument_activity` |
| `audit` | Deduplicated source envelopes, pricing evidence, latest order state | `ingested_events`, `pricing_evidence`, `order_state` |
| `integration` | Kafka heartbeat, report schedules/requests, batch attempts, published-version pointers, registered dashboards | `pipeline_status`, `report_batches`, `published_reports` |

Existing physical tables stay in place to preserve stored data and application compatibility. Comments on schemas/tables and the `reporting.database_guide` view provide a navigable catalog. No existing tables or historical records are deleted. This is logical organization, not a destructive migration.

## What the internal public tables store

- `client_accounts`: account ID, client ID, email for administrators, cash balance, suspension flag, source and load timestamps.
- `client_positions`: account ID, instrument ID, shares owned, source and load timestamps.
- `instruments`: instrument ID, ticker, name, security type, trading availability and timestamps.
- `trade_records`: original order ID, client/account/instrument IDs, side, type, quantity, optional limit/stop prices and placement time.
- `trade_lifecycle_events`: submitted/accepted/filled/rejected states, event time, price, quantity, rejection reason and whether evidence was imported as a snapshot.
- `cash_holding_changes`: source movement ID, related account/order/client/instrument, movement type, cash delta, share delta and time.
- `admin_audit_log`: staff identity, action, target, reason and time.
- `monthly_client_segments`: legacy month-end values/activity segments. **The current report job does not populate this table.** Empty monthly reports are not evidence of no client activity.

Passwords, MFA secrets and sessions stay in the auth database. The reporting database does not store them. Bank credentials are excluded from the pipeline.

## Portfolio size and classes

Portfolio size is **all account cash plus market value of all holdings for one client, in USD**. Cash reserved for an order is still owned cash; do not subtract it twice. Totals are rounded to USD cents before assigning a class, so a displayed $100,000.00 remains Class B. This is different from available-to-trade cash and from gross traded notional (the sum of absolute executed trade cash amounts).

| Class | USD portfolio size | Example |
| --- | --- | --- |
| C | Below $10,000 | $9,999.99 |
| B | $10,000 through $100,000, inclusive | $10,000 and $100,000 |
| A | Above $100,000 | $100,000.01 |

Example: $8,000 cash plus 20 shares valued at $150 = $11,000, Class B. Buying shares moves value from cash into holdings; it does not by itself add to portfolio size. Execution at ask and valuation at provider `price` can create a small immediate spread loss.

The trading backend saves valid fetched quotes in `instrument_marks`, using provider `price` for valuation, not ask/bid or average purchase cost. Its existing outbox copies marks through Kafka into `reporting.instrument_marks`. No new provider API calls or constant market polling are introduced. Marks update only when existing trading/display requests fetch quotes. This means inactive clients can have old quotes.

`reporting.client_portfolios` joins copied cash, quantities, instrument symbols and marks; it groups multiple accounts by client. Both staff UIs have a name/class filter in Reports. The API is `GET /api/v1/analytics/clients/portfolios?portfolioClass=B&q=Cam`, limited to 100 results; narrow the name/class search to find more clients. Allowed classes are A, B, C, `unclassified`, or empty for all.

- `observed`: every held instrument has a known USD quote and none is provider-flagged stale or over 24 hours old. This is not a guarantee of a live price.
- `stale`: classification uses known observed prices, with at least one provider-stale or over-24-hour quote. Inspect `oldest_quote_at`.
- `unpriced`: at least one position has no known USD mark (including non-USD instruments; FX conversion is not implemented). Holdings total, portfolio value and class are NULL, never a misleading zero/Class C. Cash-only clients can be classified without any quotes.

Reporting mirrors are eventually consistent, not one atomic live trading snapshot. Cash, holdings and mark events can arrive separately, so a transient class can change while synchronization catches up. The view exposes account/quote timestamps. Financial execution remains atomic in the trading database.

Superset prepared dashboards include **Current portfolio class**, **Current portfolio size**, and **Valuation quality** filters. These are added without replacing authored dashboard layouts or existing filters. `analytics.named_published_trades` exposes `current_portfolio_class`, `current_portfolio_size_band`, `current_valuation_status`. These describe today's observed classification, even when filtering historical trades. They are not frozen historical classes. Clients with no published trades are visible in `reporting.client_portfolios`, not in a trade-based dashboard.

## Useful SQL for analysts

```sql
-- Explore what is stored where.
SELECT * FROM reporting.database_guide ORDER BY schema_name, object_name;

-- All Class B clients, including people who have not traded.
SELECT client_name, portfolio_value, currency, valuation_status, oldest_quote_at
FROM reporting.client_portfolios
WHERE portfolio_class = 'B'
ORDER BY portfolio_value DESC;

-- Build a custom joined dataset in Superset SQL Lab.
-- Aggregate trades before joining so the portfolio value is not counted per trade.
WITH trades AS (
  SELECT client_id, count(*) AS trades, sum(cash_amount) AS gross_traded_notional
  FROM analytics.published_trades GROUP BY client_id
)
SELECT p.client_name, p.portfolio_class, p.portfolio_value,
       p.valuation_status, coalesce(t.trades,0) AS trades,
       coalesce(t.gross_traded_notional,0) AS gross_traded_notional
FROM reporting.client_portfolios p LEFT JOIN trades t USING(client_id);
```

## Live copies versus published reports

Kafka consumer updates current mirrors continuously. The daily/manual batch freezes reconciled trade facts with a cutoff and publishes a version pointer. `analytics.published_trades` selects the published batch for each report date; it is not the same as all live copied orders. Current portfolio classification is a separate live-derived view, not an end-of-day historical snapshot.

Historical portfolio valuations need cash/holdings snapshots and historical market prices at a declared cutoff. This feature does not invent missing historical marks, populate legacy month-end segments, or treat old execution prices as current prices.

## Applying changes

Run `bash scripts/start-project.sh --all` to apply the idempotent trading/reporting schemas and start the stack. Rebuild changed images when prompted/by the script. Superset initialization refreshes dataset columns and adds filters; it must run after the reporting schema is applied. No root `.env` changes are needed. Quotes fetched after this update begin populating marks. Existing installations with no marks initially show invested portfolios as unclassified until valid quotes are observed.

## Verification

`python3 scripts/verify-db-schemas.py` creates disposable databases and reruns schemas; portfolio fixtures in `DB/tests/portfolio-classes.sql` cover thresholds, multiple accounts, cash-only clients, zero quantities, missing/foreign-currency quotes, stale flags and analyst access. `python3 scripts/verify-admin-analytics.py` checks the outbox/consumer, deduplication, cash reconciliation and report cutoffs using disposable databases, including quote mark ordering. These scripts require Docker and a running trading Postgres container. They do not reset live databases.

## Naming and retirement review

The [schema review](schema-review.md) lists all 20 tables, their actual writers/readers, clearer proposed names, the inactive monthly feature, currently unpopulated columns, and a coordinated migration plan. It distinguishes required history from redundant-looking read views. Proposed names are not yet physical database renames.
