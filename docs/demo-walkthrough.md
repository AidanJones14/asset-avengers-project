# Load and demonstrate the project

Run from the repository root after configuring the single root `.env`:

```bash
bash scripts/start-project.sh
bash scripts/load-demo-data.sh
```

The loader is opt-in development data; normal startup still creates no funded
portfolios. It uses `docker-compose` without newer quiet/wait flags. Start the
full project, including publisher, consumer and reporting-job, before loading.
It preserves existing data and does not stop the project or delete volumes.

## Logins

Password for newly created demo logins: **EndgameDemo123!**. Existing passwords are
never reset. Client page: `http://localhost:8084`; staff pages:
`http://localhost:8086/admin.html` and `http://localhost:8086/analyst.html`.
Use the Docker host IP instead of localhost when browsing from another VM.

| Login | Role | Initial cash available | Holdings |
|---|---|---:|---|
| cameron.demo@example.com | Client — Cameron Kelly | $21,250 | 12 AAPL, 4 MSFT |
| carol.demo@example.com | Client — Carol Jones | $13,040 | 8 NVDA, 2 VOO |
| daniel.demo@example.com | Client — Daniel Reed | $9,500 | None |
| david.admin@example.com | Admin | — | — |
| priya.analyst@example.com | Analyst | — | — |

Client names originate in auth. Trading fixtures use the same UUIDs and names;
reporting receives them through the normal outbox/Kafka projection. The original three clients each
have a simulated bank link and five watchlist entries. The two extensions add 96 clients with ten watchlist entries each. The original fixtures include deposits,
a withdrawal, six fills across three New York dates, one insufficient-cash rejected order, lifecycle history, pricing evidence and two synthetic suspension/unsuspension audit entries.

The seeded fills and their quotes are explicitly synthetic, not provider quotes.
They create no pending orders and make no pricing API calls. Current market
values and any new live simulated trades still use the configured pricing provider.
The old `DB/admin_analytics_db_test_data.sql` is a separate isolated-test fixture;
the loader intentionally does not insert disconnected reporting rows from it.

## Suggested demonstration

1. Log in as Cameron. Show the full name, funded balance, holdings, purchase history,
   return calculations, allocation and watchlist. Market values use current quotes;
   seeded purchase prices are historical synthetic examples.
2. Open Bank Accounts. Use the existing simulated bank to deposit/withdraw and show
   the saved cash balance update. Buy or sell through the watchlist or order form.
3. Open Admin in another browser/tab. Keep Orders visible: the list checks for new
   copied trades every three seconds without reloading, retaining filters/page.
   It skips hidden tabs, preserves existing rows during retries, and stops polling
   on logout or when leaving Orders. Ingestion adds a short synchronization delay.
4. Search Clients with `ca`: choose Cameron or Carol. Inspect balances, holdings and
   cash history. Open an order's timeline/pricing evidence and download its audit PDF.
5. Open Actions, type a person’s name, and select their account without typing a
   UUID. Demonstrate a deliberate suspension/unsuspension with a reason; review/download
   the staff audit log. The loader itself never changes existing suspensions.
6. Open Reports. The loader publishes reports for the seeded trade dates and today;
   choose a populated dashboard or download a report PDF. Use **Generate daily report
   now** after placing additional trades. Reopen an already open dashboard to reload
   published data; chart caching can take 30 seconds.
7. Log in through Analyst separately. Show name suggestions, published client activity,
   dashboards and PDF reporting, with admin controls unavailable.

## Reruns and storage

`DB/demo/auth.sql` creates dedicated demo identities; `DB/demo/trading.sql` writes
all initial financial state/history in one transaction using dedicated `de…` UUIDs.
The existing triggers create the linked cash ledger and outbox records. All cash
movements reconcile with initial balances; filled quantities reconcile with holdings.

Rerunning the loader does not duplicate fills or reset later trading/deposits. It
waits for copied fills and a newer source heartbeat before publishing reports.
If ingestion times out, source records remain saved; fix publisher/consumer health
and rerun. Reports follow the normal append-only batch/replacement-pointer rules,
so rebuilding does not double count dashboard totals. Past demo days cover the full
local day; today's report covers midnight through the loader's captured cutoff.
The automatic report schedule is unchanged. No secrets or new `.env` files are added.

For a completely fresh demonstration, use `bash scripts/stop-project.sh` and choose
`y` to delete **all project data**, then start and load again. Choose `no` to retain
saved data between demonstrations.

## Verification without changing application data

```bash
python3 scripts/verify-demo-data.py
```

Requires Docker and the existing `asset-analytics-pipeline:local` image. Uses an isolated
PostgreSQL container/network, checks source/ledger/holding reconciliation, safe reruns,
projection permissions and repeated report publication, then removes its own resources.

The current loader no longer creates a cancelled-order example. Previously loaded
cancelled fixtures remain historical records; reruns do not rewrite audit history.
Cancellation is implemented for open client orders, but is not needed for this demo.
The rejected fixture now models an affordable submission followed by an execution
price increase, with valid synthetic quotes and the execution cash-rejection reason.


## Presentation guide and current workspace names

See [presentation guide](presentation-guide.md) for Ultron (admin), J.A.R.V.I.S. (analyst), development logins, spread/return examples, PDF interpretation and the expanded 99-client / 2,526-fill demo. Staff development images use `:local`. Existing data is preserved; run the demo loader to add the extension.

Additional identities and funding are defined in `DB/demo/expanded-auth.sql` and `DB/demo/expanded-trading.sql`. That earlier extension has 27 clients, 486 fills and one rejected order before the presentation extension below. The additional 24 clients each have ten completed buy/sell pairs; use the original Cameron/Carol portfolios to demonstrate shares still held.


## Expanded portfolio and audit demonstration

The loader also applies `DB/demo/presentation-auth.sql` and `DB/demo/presentation-trading.sql`. On a fresh load all fixtures together create **99 clients, 99 bank links, 975 watchlist entries, 2,526 fills, 13 rejected orders, 12 disputes and seven staff audit events**. There are no pending orders or cancellations in these fixtures. Activity covers up to 90 previous New York calendar days. The extra 2,040 fills use fractional quantities and include profitable, flat and losing completed buy/sell pairs. Additional clients also demonstrate withdrawals, dividends and five currently suspended accounts.

New logins are `client.201.demo@example.com` through `client.272.demo@example.com`, with the same demo password shown above. Names combine Avery, Cameron, Casey, Jordan, Morgan, Riley, Sam, Taylor, Alex, Jamie, Robin and Skyler with Adams, Bennett, Clark, Davis, Ellis and Franklin. These give name searches useful prefixes and multiple matches.

| Login | Name | Initial portfolio value | Class |
| --- | --- | ---: | --- |
| client.201.demo@example.com | Avery Adams | $9,999.99 | C |
| client.202.demo@example.com | Cameron Adams | $10,000.00 | B |
| client.203.demo@example.com | Casey Adams | $100,000.00 | B |
| client.204.demo@example.com | Jordan Adams | $100,000.01 | A |

These four accounts have cash only and no trades. Use the **Reports → Client portfolio size** table to find them; a dashboard built from published trades will not include clients who have not traded. Other added clients have initial funding around $5,000, $50,000 or $250,000 plus reconciled cash movements, so traded clients populate all three class filters in Superset. All presentation extension positions finish at zero; the original Cameron/Carol portfolios still demonstrate holdings. No synthetic quote is inserted into the real latest-market-price tables; the original invested portfolios remain unclassified until normal provider quotes are observed.

The 12 disputes relate to dedicated rejected demo orders and include submitted, in-review and resolved examples. They are stored in the trading database and exposed through the existing administrative dispute flow, not inserted into a fake reporting table. All rejection and dispute text is explicitly synthetic.

Rerunning adds missing extension accounts but preserves existing account balances, trades, passwords, MFA enrollment and suspensions. New client UUID/email collisions abort instead of replacing identities. The ingestion check compares actual demo account, order, fill and movement counts against source counts; it waits up to 15 minutes, printing progress every 30 seconds, before publishing daily reports. Larger loads can take several minutes. This does not change the normal report schedule or add a background market-data poller.

### Multiple investment accounts

Fresh demo fixtures now include **100 investment accounts for 99 clients**. Presentation accounts span brokerage, Roth IRA, Traditional IRA and HSA. Avery (`client.201.demo@example.com`) also owns a zero-cash HSA, preserving the original Class C boundary. Select either investment account when filing a dispute and inspect it in Ultron/J.A.R.V.I.S. Existing fixtures are not renamed on rerun. See [account visibility and demonstration steps](admin-analytics/investment-account-visibility.md).
