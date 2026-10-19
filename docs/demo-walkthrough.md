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
have a simulated bank link and five watchlist entries. The extension adds 24 clients with ten watchlist entries each. The original fixtures include deposits,
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

See [presentation guide](presentation-guide.md) for Ultron (admin), Friday (analyst), development logins, spread/return examples, PDF interpretation and the expanded 27-client / 486-fill demo. Staff development images use `:local`. Existing data is preserved; run the demo loader to add the extension.

Additional identities and funding are defined in `DB/demo/expanded-auth.sql` and `DB/demo/expanded-trading.sql`. On a fresh load the combined fixture has 27 clients, 486 fills and one rejected order. The additional 24 clients each have ten completed buy/sell pairs; use the original Cameron/Carol portfolios to demonstrate shares still held.
