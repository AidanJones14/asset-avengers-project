# Order validation and execution

The implemented API is `/api/v1/orders`, using lowercase enum values. This document describes the current implementation; `endgame-api.yaml` describes a broader target API that is not yet fully implemented.

## Flow

1. `POST /api/v1/orders` validates the request, account, instrument and available resources.
2. An accepted order and its cash commitment are saved in one transaction. The response is HTTP 201 with `status: "accepted"`. Cash and holdings are unchanged at this point.
3. A separate worker polls committed accepted orders every five seconds. It also finds accepted orders left behind after a restart.
4. Execution obtains a fresh quote, checks price conditions and affordability again, then updates cash, holdings, order status and an immutable `trade_fills` record in one transaction.
5. A business failure at execution sets `rejected`, records `rejectionReason` and releases the commitment. Temporary pricing/database failures leave the order accepted for retry. A failed transaction cannot leave only some balances or records updated.

Malformed or invalid submissions return HTTP 400 with `code: "VALIDATION_ERROR"` and a readable `detail`. They are not recorded as accepted orders. Unavailable or unusable market quotes return HTTP 502 when required for submission.

## Validation rules

- Account, instrument, side, type and positive quantity are required.
- The account must exist and not be suspended; the instrument must exist and be active.
- Quantities and submitted prices must fit the SQL `NUMERIC(18,4)` columns. Fractional quantities are supported; extra nonzero decimal places are rejected instead of silently rounded.
- Available cash is the cash balance minus commitments from open buys across all instruments.
- Available shares are holdings minus quantities in open sells for that same instrument. Short selling is not supported.
- Account locking serializes resource checks with order creation, changes, cancellation and execution. Order locking prevents duplicate execution and conflicting changes to the same order.

| Type | Submitted prices | Buy cash commitment | Execution condition |
| --- | --- | --- | --- |
| `market` | Neither limit nor stop | Quantity × current ask | Next usable quote |
| `limit` | Positive limit only | Quantity × limit | Ask ≤ limit for buy; bid ≥ limit for sell |
| `stop` | Positive stop only | Quantity × max(current ask, stop) | Ask ≥ stop for buy; bid ≤ stop for sell |
| `stop_limit` | Both positive; buy limit ≥ stop, sell limit ≤ stop | Quantity × limit | Trigger stop, then satisfy limit; the trigger persists across worker polls |

Buys execute at the current ask and sells at the current bid, including price improvement when available. The quote must identify the requested instrument and currency, have `stale: false`, and have a valid timestamp. Each market buy submission and every execution fetches a quote from the pricing provider again. The latest available quote is accepted regardless of trading hours or timestamp age, including the last closing quote over nights, weekends and holidays; the provider must still mark it non-stale. Future timestamps beyond five seconds are rejected. A missing side price is not replaced with the last-traded price.

The existing cash ledger uses USD and two decimal places. Buy commitments and debits round up to cents; sell credits round down. Execution prices fit four decimal places, rounded up for buys and down for sells. These are simulator accounting rules, not exchange-specific tick/lot rules. Trades worth less than one cent at execution are rejected.

## Changes and status

- `GET /api/v1/orders/{orderId}` returns status, execution price, timestamps and an execution rejection reason when present.
- `PATCH /api/v1/orders/{orderId}` with `{"price": 51}` changes the limit on limit/stop-limit orders, or the trigger on a stop order. It revalidates the complete order and replaces its commitment without counting the old commitment twice. It never edits execution price.
- `PATCH /api/v1/orders/{orderId}/cancel` cancels an open order and releases its commitment.
- Filled, rejected and cancelled orders cannot be changed or executed again.
- Legacy `submitted` orders continue to count toward available resources but are not automatically executed. Cancel and resubmit them to run the new validation flow.

## Database and local setup

Apply `DB/endgame_db.schema.sql` to your development PostgreSQL database before starting the updated backend. It adds the `accepted` status, `reserved_cash`, `stop_triggered` and the append-only `trade_fills` table. It also allows an unfinalized order to have a null finalization timestamp. The entity uses the schema's `date_placed` column consistently.

The script backfills commitments for existing open limit/stop-limit buys. Existing open market/stop buys have no trustworthy stored quote: cancel and resubmit those before accepting further buys. Existing legacy filled orders may lack trade-fill history; this change does not invent fill records for them. Fresh catalogue seeds contain no orders.

The worker uses the existing Fauxnance pricing client and its existing environment configuration. Set:

```properties
orders.execution.enabled=true
orders.execution.poll-delay-ms=5000
```

Set `orders.execution.enabled=false` when you want to inspect accepted orders without automatic execution. Tests disable the timer and invoke execution explicitly, using controlled quotes and an isolated database.

Example: replace `YOUR_ACCOUNT_UUID` with the account ID from your authenticated
trading-account snapshot. The server checks that it belongs to you. A symbol can be
used instead of an instrument ID:

```json
{
  "accountId": "YOUR_ACCOUNT_UUID",
  "symbol": "AAPL",
  "orderType": "limit",
  "orderSide": "buy",
  "quantity": 30,
  "limitPrice": 50
}
```

This commits $1,500 if available. The order stays accepted until a usable ask is at most $50, at which point the whole order fills at that ask. A $50 limit is not a request to force the market price to $50.

## Tests

From `backend/`, run:

```bash
mvn test
```

The suite covers request/API failures, cash/share commitments, fractional shares, price editing, cancellation, execution-time quotes, limit/stop conditions, stale and unavailable data, concurrency, duplicate execution, startup, and transaction rollback after database write failures. By default, tests use H2 in PostgreSQL compatibility mode. The order-flow tests mock only the market-data boundary; the services, Spring transactions and repositories are real. No live market API is called.

To run against PostgreSQL 18.6, from the project root:

```bash
python3 scripts/run-backend-postgres-tests.py
```

This creates a disposable database in your running `endgame_postgres` container,
applies the actual SQL schema, and runs the complete backend suite with Hibernate
schema validation. It checks PostgreSQL constraints, transaction rollback, concurrency
and the append-only fill trigger. The temporary database is removed afterward; the
running app's `endgame_test` data is untouched. It requires Docker, Java 25 and Maven.
Use `--container`, `--port` and `--java-home` for another local setup.

The setup script's readiness check uses TCP to avoid mistaking the Docker image's temporary initialization server for the final PostgreSQL server.

## Remaining project requirements

This implements the backend validation, durable acceptance and atomic quote-based execution portions of BR-04/05/06/08/09. The example photo shows an order-book matching engine with partial fills. This simulator uses market quotes and fills a whole order; it does not match client orders or implement partial fills.

Trading and banking requests are now scoped to the verified JWT user. The client uses persisted backend orders and reloads cash, holdings, order history and stars from PostgreSQL. See [Persistence and API usage](persistence-and-api-usage.md).

BR-12 is not complete: USD instruments with usable pricing are supported, but the ledger has no multicurrency balances or FX conversion, and the instrument model has no FX asset class. Non-USD instruments are rejected explicitly. UK/Indian currency settlement and full launch-asset coverage require that additional design and pricing integration.

Current deposits and withdrawals acquire the account lock; withdrawals respect open buy commitments. Future transfers must use the same locking and reservation rules. The simulator currently assumes quote liquidity for a full fill and does not model fees, slippage, partial liquidity, or exchange-specific trading rules.

## Saved live portfolio

Banking, orders and watchlists use the authenticated user’s persistent account.
The client layout polls the trading-account snapshot every three seconds and refreshes after
order submission, deposits and withdrawals. Polling stops when the client layout is
destroyed. Each snapshot reads cash, cash reservations, holdings and order history
in a repeatable-read transaction so the UI does not combine balances from opposite
sides of an execution commit. Cash Available to Trade excludes cash reserved by open buys;
portfolio value uses the full cash balance. Holdings change only after execution,
which still runs on the five-second worker schedule. Temporary refresh failures
retain the last snapshot and retry on the next poll.

Portfolio display prices are checked every fifteen seconds (using the shared one-minute cache) while the client layout is active.
Portfolio value includes the full cash balance and holdings at the latest available
market price. Total return combines realized gains and losses with unrealized return
on positions whose full trade-fill history is available, using average-cost accounting
and actual rounded cash amounts. Seeded/imported shares without purchase history have
unknown cost basis and are excluded from return calculations; their market value
still counts toward portfolio value. Price failures retain the last available quote.
