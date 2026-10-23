# Saved accounts and pricing API usage

The signed-in user's JWT `sub` is the stable user UUID. The browser does not choose
which user owns a portfolio. Spring verifies the token, creates the matching trading
user/account on the first authenticated request, and reuses that account afterward.
A new account has zero cash, no bank accounts, no holdings, no orders and no watchlist
items. The 577 symbols in `DB/instruments.seed.sql` are a shared stock catalogue, not positions
or stars assigned to a user. `DB/instruments.seed.sql` imports that metadata without
requesting prices. Existing instrument identities and trading data are preserved. Catalogue imports
replace ticker-only placeholder names with company names while preserving existing
descriptive names. Company-name search filters the saved catalogue without quote
requests; quotes are fetched when a matching stock is selected or starred.

## What is stored

| Database         | Tables                            | Purpose                                                                  |
|------------------|-----------------------------------|--------------------------------------------------------------------------|
| Auth database    | `users`                           | Email, bcrypt password hash, roles and the stable login UUID             |
| Auth database    | `sessions`, refresh-token history | Session expiry, revocation and hashed rotated refresh tokens             |
| Trading database | `users`, `accounts`               | Login UUID link and saved cash balance                                   |
| Trading database | `bank_accounts`                   | Bank accounts the user adds                                              |
| Trading database | `transactions`                    | Deposits, withdrawals and ledger events                                  |
| Trading database | `orders`                          | Submitted order terms, cash reservations and final status                |
| Trading database | `trade_fills`                     | Immutable execution price, quantity and actual cash amount               |
| Trading database | `holdings`                        | Current quantity by account and instrument                               |
| Trading database | `watchlists`, `watchlist_items`   | Stars saved to the signed-in user's watchlist                            |
| Trading database | `instruments`                     | Shared instrument metadata; loading the catalogue makes no pricing calls |

Average purchase cost and realized return are derived from permanent trade fills.
Positions imported without a purchase history have unknown cost basis and are excluded
from return calculations; their market value still counts toward portfolio value.
The previous fabricated performance history and benchmark have been removed. Historical
portfolio valuations are not currently recorded; the performance card shows actual
current value and recorded-trade return.

## Login and refresh

The access token is held in memory. The refresh token is stored in per-tab
`sessionStorage`. On page reload, the app exchanges that refresh token for a new pair,
then loads the same user's account snapshot and stars from PostgreSQL. Logging out
clears browser authentication, not trading records. Logging in again restores the
same account by login UUID. Client signals are display state, not the financial ledger.
The separate stock-search screen submits persisted backend orders too; it no longer
pretends a browser-only trade was a saved fill.

Docker keeps the databases outside the replaceable app containers: the trading database
uses the host-mounted PostgreSQL directory and auth uses its named volume. Rebuilding
or restarting backend/frontend containers does not erase either database. Removing
those database volumes/directories or deliberately resetting the database does.

## Reducing paid quote requests

Adding a catalogue alone does not reduce quote requests. The following controls do:

- Quotes are requested only for holdings, starred stocks, an explicit ticker lookup,
  or an order, not for all catalogue entries.
- Display prices share a bounded backend cache keyed by symbol, with a default
  60-second lifetime (`pricing.api.display-cache-ttl=PT1M`). Concurrent display requests
  for the same symbol reuse the same quote across browser tabs and users.
- The client checks display prices every 15 seconds and pauses both display-price and
  account polling while the page is hidden. Account polling every three seconds reads
  PostgreSQL only; it does not call the pricing provider.
- Pending limit/stop orders are monitored using cached quotes. When a price may execute,
  execution fetches again and verifies the conditions before changing money or shares.
- Market-buy validation and actual execution deliberately bypass the display cache.
  A buy normally needs one pricing request to validate and another to execute.

For example, 10 actively held/starred symbols across visible clients typically need
about 10 upstream display requests per minute, not one request per browser refresh.
Trading requests and cache expiry/restarts add to that. An empty new portfolio makes
no automatic price requests. The cache is in backend memory, not a permanent DB price
history; a backend restart makes the next active-symbol lookup fetch again. The provider
may itself return a cached closing price outside trading hours. Provider-marked stale quotes and quotes older than two minutes are refused for trading
(`PRICING_MAX_QUOTE_AGE`, default `PT2M`). Old closing quotes are display-only. Invalid timestamps, mismatched symbols/currencies
and missing or nonpositive side prices still cannot execute an order.

## New instrument discovery

An existing ticker lookup reads instrument metadata from the trading database without
requesting a quote. For an unknown ticker, the backend verifies valid symbol/price/currency
data with the pricing provider, then atomically inserts the instrument into endgame.
Repeated or concurrent lookups reuse the unique symbol record. A direct order containing
a symbol uses the same discovery path when the symbol is not yet in the database.
Discovery commits independently, so a valid instrument remains available even if the
later order is rejected for insufficient cash or shares. Invalid pricing does not create
a made-up instrument. Discovery uses the shared display cache; actual buy validation
and execution still fetch fresh pricing. No instrument metadata goes into auth DB.

## Selecting investment accounts for banking

The Bank Accounts cash selector defaults to **All Accounts** and sums each active
investment account's server-reported `availableCash`, excluding cash reserved for
open buy orders. Selecting one account filters only this display, not the shared
portfolio selection or either transfer form. Balances reload on page entry,
account-list changes, and successful deposits or withdrawals, and refresh every
15 seconds while the page is visible. Failed loads show an explicit retry state
rather than a partial total. Filtering itself makes no additional requests.

Both Add Funds and Withdraw Funds require their own investment-account selection.
`POST /api/v1/bank-accounts/deposit` and `/withdraw` require `accountId` alongside
`bankAccountId` and `amount`. The service locks the selected investment account,
checks ownership and active status, and applies the cash change and transaction
record atomically. Withdrawals also exclude cash reserved for open buy orders.

## Position purchase history

Click a holding's name to see position details and its recorded purchases. The account
snapshot supplies purchase history from immutable buy `trade_fills`, including time,
quantity, execution price and actual cash cost. Repeat buys update weighted average
cost; sells preserve the history while reducing current shares at average cost.
History is restored from endgame on reload/login and includes buys subsequently sold.
Position gain/loss covers currently owned shares; portfolio return also includes
realized results. No new database schema is needed for this view.
