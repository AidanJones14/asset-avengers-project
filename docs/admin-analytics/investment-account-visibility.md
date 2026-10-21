# Investment accounts in staff reporting and disputes

Investment accounts are the named accounts a client creates in Endgame: Individual Brokerage, Roth IRA, Traditional IRA, HSA, 401(k), or 529. They are different from linked bank accounts. A client can own multiple investment accounts, including multiple accounts of the same type. Names/types are display labels; the account UUID identifies the account and determines ownership.

## Filing a dispute

The client selects an **Investment account** dropdown in Orders → File a dispute. Options show the client's account name and type. The current investment account is selected initially when available, and the client can choose another owned account. Changing accounts clears a selected related order; the related-order dropdown loads orders for the selected investment account. Failed order loading offers a retry and still permits a general account/funding dispute without a related order. Switching accounts ignores late responses from a previously selected account and makes no market-price requests.

Example: Cameron owns “Main investing · Individual Brokerage” and “Retirement · Roth IRA.” To dispute a Roth IRA contribution, select “Retirement · Roth IRA,” choose Deposit or withdrawal, and describe the issue. It is not necessary to select a linked bank account or type a UUID.

The POST to `/api/v1/me/disputes` carries `accountId`, optional `orderId`, `category`, and `description`. The backend independently checks that the account belongs to the verified JWT user and, when provided, that the order belongs to that same investment account. Editing a dropdown or forging JSON cannot change ownership. Dispute responses/history include `accountId`; clients see the associated investment-account label, and Ultron receives account name/type with the live intake record. Filing does not move cash or change an order.

## Ultron

Account name and type appear in account search/detail, order list/evidence, suspension suggestions/selection, and the dispute list. Account UUIDs remain available to distinguish identically named accounts. Account-level administrative actions still target the explicitly selected UUID, not every account owned by that client. The order audit PDF receives the same account metadata as the screen/export.

## J.A.R.V.I.S. and Superset

Selecting a client by name shows their investment accounts, including accounts with no published trades, plus published activity separated by investment account. `GET /api/v1/analytics/clients/{clientId}/accounts` reads the analyst-safe `reporting.investment_accounts` view: account ID, name, type, suspension, and source timestamp. It exposes no linked bank numbers or client emails. Activity returns up to 100 date/account groups.

`analytics.named_published_trades` now includes `accountId/accountName/accountType` in API mappings (SQL: `account_id`, `account_name`, `account_type`) and `account_label`. The prepared Superset dataset refreshes these columns and adds **Investment account** and **Investment account type** native filters. The account label includes its UUID so accounts with the same name/type cannot be merged accidentally. Prepared client summary tables group by client and account labels. Existing authored layouts and filters are retained.

The published financial PDF adds investment-account activity with client, account ID/name/type, trade count, and gross traded notional. It enforces a 1,000-account-group export limit, rather than silently truncating.

Portfolio class A/B/C remains a **client-level** classification across all their accounts. Filtering trades to Roth IRA does not recalculate that client class as a Roth-only portfolio value. Account filters select existing trades; they do not change publication cutoffs or financial facts.

## Storage and history

1. Trading `accounts.account_id/account_name/account_type` remain authoritative.
2. The existing trading outbox includes account metadata, and the Python consumer upserts it into reporting `public.client_accounts`. Older payloads missing labels do not erase known labels.
3. Admin read views and the analyst-safe `reporting.investment_accounts` view expose labels without duplicating financial movements.
4. Newly built `analytics.trade_facts` batches capture account ID/name/type **at publication time**, not necessarily their names on execution day. Named published views expose those saved labels.
5. Older immutable batches have NULL new metadata fields. The named view enriches them through their original order/account relationship using current copied labels. This fallback is current metadata, not reconstructed historical labels. No old fact row is rewritten.

Example SQL:

```sql
SELECT client_name, account_name, account_type, sum(cash_amount) AS gross_traded_notional
FROM analytics.named_published_trades
WHERE account_type = 'Roth IRA'
GROUP BY client_id, client_name, account_id, account_name, account_type;
```

## Upgrade and demo

Run `bash scripts/start-project.sh --all` after updating the root `.env` as described in the PR. The schema adds nullable columns and updates views without deleting records. Rebuild/restart the publisher, consumer, report worker, APIs and UIs. Publisher account snapshots use a new stable metadata version so already-consumed snapshot IDs do not prevent existing accounts from receiving names/types. Repeated snapshots remain idempotent. There are no additional provider API calls or new environment keys for this feature.

Then run `bash scripts/load-demo-data.sh` if desired. Fresh fixtures contain 99 clients and **100 investment accounts**. Presentation accounts include brokerage, Roth IRA, Traditional IRA and HSA. Avery (`client.201.demo@example.com`) has an additional zero-cash HSA for demonstrating multiple accounts while retaining the $9,999.99 Class C boundary. Existing demo account names/types, cash and later edits are preserved on rerun; old installations are not silently relabelled to match fresh fixtures.
