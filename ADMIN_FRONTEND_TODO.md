# Admin frontend: what needs building

The backend admin API is done (`/api/v1/admin/**`, in `backend/src/main/java/com/avengers/endgame/admin/`). The Angular app has no admin screens yet. This is the list of what to add.

## 1. Routing and access

- [ ] Add an `admin` route with its own layout (like `ClientLayout`), guarded by `requireRole('ADMIN')`.
- [ ] Redirect to the right home after login, based on role. `auth-page.ts` currently always goes to `/client/overview`. ADMIN should go to `/admin/clients`.
- [ ] Update the `**` fallback route so admins aren't sent to a client page.
- [ ] Add admin navigation for Clients, Orders, Instruments and Audit log.

## 2. API service

- [ ] Create `src/app/api/admin/admin-api.service.ts` and `admin.ts` (types), following the pattern in `api/orders/`.
- [ ] Send the `X-Admin-Id` header on every admin request, set to `auth.claims().sub`. The backend doesn't read the JWT yet, so this header is how it knows who is acting. Do it in one place (the service or a small interceptor for `/api/v1/admin/`), so it's easy to remove when auth lands.
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
- [ ] An order summary plus a timeline of `events`. Each event's `step` is one of `accepted`, `submitted`, `filled`, `rejected`, `cancelled` or `cash_and_holding_change`.
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
- **No data before the Kafka consumer exists.** Until then, the analytics database only contains `DB/admin_analytics_db_test_data.sql`.

## 6. Client-side changes caused by suspensions

- [ ] When an account is suspended, `POST /api/v1/orders` returns 400 with `detail: "Account is suspended"`. The trade dialog should show that message.
- [ ] When an instrument is suspended, orders return `"Instrument is not tradable"` and the quote endpoint refuses it. The stock search and trade dialog should handle both.
- [ ] Optional: show a "your account is suspended" banner. `AccountResponseDto` already has `suspended`.

## 7. When auth is added

- [ ] Remove the `X-Admin-Id` header. The backend will take the admin from the JWT, and the `AuthInterceptor` already attaches the token.
