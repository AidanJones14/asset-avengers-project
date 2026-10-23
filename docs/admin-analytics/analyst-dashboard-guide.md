# Using the J.A.R.V.I.S. analyst dashboards

## Start here

1. Sign in through the analyst login page and open **Reports**.
2. Under **Analyst dashboards**, choose a dashboard and click **Open dashboard**.
   **Client activity** is the default when available. Changing the selection does
   not open it until you click the button.
3. Open the filter panel inside the embedded dashboard. Select your values, then
   click **Apply filters**. Selecting an option alone does not apply it.
4. Read both the summary table and chart. To remove restrictions, clear the
   selections, set **Report dates** to **No filter**, and apply again.

The portal's **Filter portfolios** button filters only its portfolio table.
It does not filter the embedded Superset dashboard. Likewise, selecting a client
in the portal's name search does not automatically filter the embedded charts.
Use the dashboard's own **Client name / ID** filter for those charts.

## Which dashboard should I use?

| Dashboard | Question it answers |
|---|---|
| Client activity | Who traded, through which investment account, and how much? |
| Business overview | How many trades and how much traded value were published for each report date? |
| Instrument activity | Which instruments were traded, and how much? |

**Gross traded notional** is the sum of the recorded trade cash amounts:
`SUM(cash_amount)` in USD. Buys and sells both contribute positive traded
amounts. It is trading activity, not revenue, profit, portfolio value, or net cash
flow. For example, a $100,000 buy, a $200,000 sell and a $237,000 buy total
**$537,000**. A filter selecting only that last instrument shows **$237,000**.

The Business overview chart groups by **report date**, not the individual
execution timestamp. Each bar is a USD amount; the date belongs on the horizontal
axis. Its summary table also shows trade count.

## Filters and what they mean

| Filter | Meaning |
|---|---|
| Instrument | Ticker, for example AAPL or MSFT |
| Asset type | Instrument category, not the client's A/B/C portfolio class |
| Side | Buy or sell |
| Client name / ID | Client identity; use the ID to distinguish duplicate names |
| Report dates | Published reporting dates, rather than individual execution times |
| Current portfolio class | A: over $100,000; B: $10,000 through $100,000 inclusive; C: under $10,000 |
| Current portfolio size | The equivalent monetary size band |
| Valuation quality | The reporting view's valuation status; check this before relying on a class |
| Investment account type / Investment account | Filter the client's specific account or account type |

Different filters combine to narrow the result. Multiple selections within a
select filter match any selected value. If a combination has no matching trades,
empty charts are expected; clear filters one at a time to find the restriction.
Prepared filters apply to both prepared charts. Custom charts must use a compatible
dataset and be included in each filter's scope in Superset's dashboard editor.

**Current** portfolio filters use the current replicated classification, even when
viewing older trade report dates. They do not reproduce a client's historical
class. Historical valuation snapshots are separate reporting data. A client with
no published fills will not appear in these trade dashboards merely because they
have cash or holdings; use the portfolio table for that question.

## Live data versus published reports

Kafka synchronization makes source changes available in reporting, but these
prepared trade dashboards read `analytics.named_published_trades`: only fills in
published report batches. Synchronization alone does not publish a report.

To include today's trades, click **Generate daily report now**, wait until its
status says the report is ready, then reopen or refresh the dashboard. Chart
caches may take up to 30 seconds to refresh. A request can wait while the reporting
worker catches up; inspect its status rather than repeatedly requesting reports.

**Report time (New York)** controls the shared scheduled reporting cutoff, using
`America/New_York` including daylight saving time. Schedule changes take effect
tomorrow. They do not change the daily schedule when you generate a report manually,
and do not turn the dashboards into a live order monitor.

## Creating joins, charts and dashboards

Click **Open Superset workspace** for the full Superset interface using your
analyst sign-in. The embedded dashboard is for viewing and filtering; it is not
SQL Lab or a join editor. In the workspace, use the permitted reporting datasets,
SQL Lab and chart/dashboard editors. See the [workspace guide](../jarvis-superset-workspace.md)
for access and join examples. Prefer named analytics views; join fills to accounts
and clients on their IDs, not names, and check that joins do not multiply fills
before summing traded notional. Save your own chart/dashboard copies so prepared
chart repairs do not replace your changes to the prepared chart definitions.

## Downloads

Select a published report date under **Download a published report**, then choose
**Download report PDF**. That PDF uses the published report and its cutoff; it does
not inherit the embedded dashboard's current filters. Superset chart downloads,
where your role allows them, use that chart's query and applied filters.

## Troubleshooting and applying the dashboard repair

- **Apply filters is disabled before changing anything:** normal; first change a selection.
- **It remains disabled after a selection:** old saved filter metadata may still
  be present. Deploy the updated Superset image and run its bootstrap; clearing
  the browser cache alone cannot repair server-side metadata.
- **A bar is about 1.8 trillion:** the old chart returned execution timestamps while
  expecting report dates. The bootstrap now aligns both temporal fields and adds
  currency formatting. This is a chart configuration error, not a cash balance change.
- **No new trades:** check report publication, selected report dates, other filters,
  worker synchronization and the 30-second chart cache.

For the normal local deployment, run `bash scripts/start-project.sh --all` after
updating the code. It builds and initializes the staff stack as well as the client
stack. The Superset initialization must complete successfully. Reopen the dashboard
afterward. The repair upgrades existing prepared charts and legacy filter IDs in
place and is safe to rerun; it preserves dashboard layouts and independent authored
charts. **Do not delete database volumes to apply this repair.**

For a presentation, use Client activity, select one named client and investment
account, apply the filters, explain trade count versus traded notional, then clear
the filters. Explain that these are published reports, while the current portfolio
search answers a different question.

## Asset-type demo coverage

Run `bash scripts/load-demo-data.sh` after full startup to publish examples for
`equity`, `etf`, `crypto`, `bond`, `option`, `future` and `mutual_fund`. Include
yesterday's New York report date. Daniel Reed has one closed synthetic buy/sell
pair per type. The `DEMO-*` symbols are inactive reporting examples; they do not
represent support for real derivatives margin, contract multipliers, bond interest
or mutual-fund NAV execution. See the [demo walkthrough](../demo-walkthrough.md#demonstrating-every-asset-type-filter)
for examples and the difference between supported categories and trading mechanics.
