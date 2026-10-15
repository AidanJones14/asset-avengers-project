# Admin frontend: what needs building

The staff API builds independently in `internal-backend/`, with admin and
analyst modules in one deployment. The Angular app still needs staff screens.
For immediate manual testing, use the separate [test console](internal-frontend/README.md)
on port 8086. Its plain JavaScript implementation is a working API example; these
tasks describe the final Angular interface.
Start with [the current API contract](docs/admin-analytics/frontend-api.md) and
[setup instructions](docs/admin-analytics/setup.md).

## 1. Routing and access

- [ ] Add an `admin` route with its own layout (like `ClientLayout`), guarded by `requireRole('ADMIN')`.
- [ ] Redirect to the right home after login, based on role. `auth-page.ts` currently always goes to `/client/overview`. ADMIN should go to `/admin/clients`.
- [ ] Update the `**` fallback route so admins aren't sent to a client page.
- [ ] Add admin navigation for Clients, Orders, Instruments and Audit log.

## 2. API service

- [ ] Create `src/app/api/admin/admin-api.service.ts` and `admin.ts` (types), following the pattern in `api/orders/`.
- [ ] Use the existing bearer-token interceptor. The backend gets the actor from the verified JWT; do not send `X-Admin-Id`.
- [ ] Add a type for paged responses:

  ```ts
  interface Page<T> {
    items: T[];
    page: { page: number; size: number; totalElements: number; totalPages: number };
  }
  ```

  Send `page` (0-based) and `size` (1–100, default 20) as query params.

## 3. Screens

### Client search: `GET /clients?q=&page=&size=`
- [ ] A search box (at least 3 characters, partial email match, case-insensitive) and a paged table with email, cash balance, open positions and a suspended badge.
- [ ] Each row links to the account detail.

### Account detail: `GET /accounts/{accountId}`
- [ ] Show the account summary, the positions table, and recent activity (the last 50 cash/holding changes: trades, deposits, withdrawals, dividends).
- [ ] Add a Suspend / Unsuspend button that opens a reason dialog (reason required, up to 1000 characters):
  - `POST /accounts/{id}/suspend` with `{ "reason": "..." }`
  - `POST /accounts/{id}/unsuspend` with `{ "reason": "..." }`
- [ ] After suspending or unsuspending, update the screen from the POST response, not by refetching the detail (see "Data lag" below).
- [ ] Link to "this client's orders", which is the order search filtered by `clientId`.

### Order search: `GET /orders?clientId=&symbol=&page=&size=`
- [ ] Filter by client ID and/or symbol. At least one is required, otherwise the backend returns 400.
- [ ] A paged table with symbol, side, type, quantity, limit/stop price, status badge, placed time and fill price.
- [ ] Each row links to the order lifecycle.

### Order lifecycle: `GET /orders/{orderId}/lifecycle`
- [ ] Prefer the new `/orders/{orderId}/timeline` contract with `terminal` and `provenance`. The older `/lifecycle` endpoint remains available for compatibility.
- [ ] Show the fill quantity and price on `filled`, the reason on `rejected`, and the cash and holding changes on `cash_and_holding_change`.

### Instruments
- [ ] List instruments with their `isActive` state. There's no admin list endpoint: use the existing public `GET /api/v1/instruments`.
- [ ] Add Suspend / Unsuspend with a reason dialog:
  - `POST /admin/instruments/{instrumentId}/suspend`
  - `POST /admin/instruments/{instrumentId}/unsuspend`

### Audit log: `GET /audit-log?actorId=&accountId=&action=&from=&to=&page=&size=`
- [ ] A paged table with time, admin email, action, reason, and the target (client email, symbol or order ID).
- [ ] Filters:
  - action (`view_client_account`, `view_trade`, `suspend_client`, `unsuspend_client`, `suspend_instrument`, `unsuspend_instrument`);
  - date range (`from` inclusive, `to` exclusive, ISO-8601 instants such as `2026-10-01T00:00:00Z`);
  - account.
- [ ] Add a "History" link on the account detail that opens this page filtered by `accountId`.

## 4. Shared pieces

- [ ] A reusable pager component for the `Page<T>` responses.
- [ ] A reusable reason dialog for suspend and unsuspend.
- [ ] Error handling. Errors come back as `ProblemDetail` JSON, and its `detail` field is readable text you can show directly:

  | Status | Meaning | What the UI should do |
  |---|---|---|
  | 400 | Validation error (short search, missing filter, blank reason, bad date range) | Show `detail` |
  | 403 | The caller isn't an admin | Send them away from `/admin` |
  | 404 | Account, order or instrument not found | Show "not found" |
  | 409 | Already suspended or not suspended (someone else changed it) | Show `detail` and reload the current state |

## 5. Things to know

- **Data lag.** The read endpoints come from the analytics database, which copies the trading database through Kafka. Right after a suspension, the account detail can still show the old state for a moment. The suspend/unsuspend responses come from the trading database and are always current.
- **Viewing is audited.** Each time someone opens an account detail or an order lifecycle, an audit row is written. Don't prefetch or poll those endpoints, or the audit log fills with views nobody made.
- **Enums are lowercase** (`buy`, `limit`, `filled`), the same as `/api/v1/orders`.
- **No fabricated live data.** The separate stack imports existing source records and consumes the outbox. Test fixtures are not loaded automatically.

## 6. Client-side changes caused by suspensions

- [ ] When an account is suspended, `POST /api/v1/orders` returns 400 with `detail: "Account is suspended"`. The trade dialog should show that message.
- [ ] When an instrument is suspended, orders return `"Instrument is not tradable"` and the quote endpoint refuses it. The stock search and trade dialog should handle both.
- [ ] Optional: show a "your account is suspended" banner. `AccountResponseDto` already has `suspended`.

## 7. Analyst screens

- [ ] Add an `analyst` layout guarded by `ANALYST` (and optionally `ADMIN`).
- [ ] Redirect analysts to their reporting home after login.
- [ ] Poll `/api/v1/analytics/status` for ingestion lag and the published report cutoff.
- [ ] List `/api/v1/analytics/dashboards` and embed the selected dashboard with the Superset SDK.
- [ ] Implement token renewal through the SDK's `fetchGuestToken` callback.
- [ ] Display missing/failed reports clearly; reports cover midnight to 7 PM New York time.

## 8. New audit evidence panels

- [ ] Use `/admin/trades` for the expanded ID/date/status search filters.
- [ ] Use `/admin/orders/{id}/timeline` for terminal/provenance flags.
- [ ] Show retryable pricing rejections separately from the current order status.
- [ ] Use `/admin/orders/{id}/pricing` for original quote timestamps/stale flags.
- [ ] Download `/admin/orders/{id}/export` for recorded JSON evidence.

Cancellation, amendment and stop-activation audit UI are outside this POC scope.

### Manual report button

The reference admin and analyst Reports pages now include **Generate daily report
now**. Implement `POST /api/v1/analytics/report-requests`, then poll
`analytics/status.latestReportRequest` while queued, disable duplicate submissions,
and offer the existing report PDF/dashboard actions when published. Coverage is
midnight New York up to the request instant. See the API contract for details.
