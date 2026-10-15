# Frontend API handoff

For immediate testing, use the [standalone staff console](../../internal-frontend/README.md)
on port 8086. It proxies the same API paths; this contract also applies to the final Angular UI.

Use `/api/v1/admin` and `/api/v1/analytics` through the existing Nginx origin.
During Angular development, proxy these paths to `http://localhost:8085` and the
remaining client APIs to the existing trading backend. Send the existing bearer
access token; **do not send `X-Admin-Id`**.

Admin routes require `ADMIN`. Analytics routes allow `ADMIN` and `ANALYST`.
The internal service verifies signature, expiry, issuer and audience.
A 401 means authentication is missing/invalid; a 403 means the role is insufficient.

## Admin endpoints

Existing routes are retained after moving to the separate service:

| Method and path | Purpose |
|---|---|
| `GET /admin/clients?q=&page=&size=` | Email search, at least three characters |
| `GET /admin/accounts/{id}` | Copied account, positions and recent cash movements |
| `GET /admin/orders?clientId=&symbol=&page=&size=` | Existing search contract; at least one filter |
| `GET /admin/orders/{id}/lifecycle` | Existing lifecycle contract |
| `GET /admin/audit-log` | Staff views and authoritative suspension actions |
| `POST /admin/accounts/{id}/suspend` or `/unsuspend` | Forward an authorized command to trading |
| `POST /admin/instruments/{id}/suspend` or `/unsuspend` | Forward an authorized command to trading |

Suspension body: `{ "reason": "Review requested" }`. Responses contain the current
trading state; copied read endpoints may briefly lag. The command and its staff
audit record commit together in the trading database.

New audit routes:

| Method and path | Parameters/result |
|---|---|
| `GET /admin/trades` | Optional `clientId`, `orderId`, `fillId`, `instrumentId`, `symbol`, `status`, `from`, `to`, `page`, `size` |
| `GET /admin/orders/{id}/timeline` | Order summary plus events with stable IDs, terminal flag and provenance |
| `GET /admin/orders/{id}/pricing` | Original quotes and observation/decision details |
| `GET /admin/orders/{id}/export` | Download JSON containing the timeline, original quotes and linked cash movements |

`from` is inclusive and `to` exclusive, based on order placement time. Supply ISO
instants, e.g. `2026-10-01T04:00:00Z`. Page numbers start at 0; size is 1–100,
default 20. The search result shape is:

```json
{
  "items": [],
  "page": { "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
}
```

The timeline response includes an `order` object using the existing camelCase
order DTO and an `events` array, for example:

```json
{
  "eventId": "40000000-0000-0000-0000-000000000001",
  "eventType": "rejected",
  "eventAt": "2026-10-01T13:00:01Z",
  "quantity": null,
  "price": null,
  "rejectionReason": "Quote does not contain a valid execution price",
  "terminal": false,
  "provenance": "recorded"
}
```

Show `terminal=false` rejections as **execution attempt rejected; order may retry**.
Use `order.status` for the current operational state. `provenance=snapshot` means
the event is an imported known state, with incomplete historical evidence.

Pricing entries contain `evidenceId`, `orderId`, `phase` (`submission` or
`execution`), `decision`, `reason`, `observedAt`, and a `quote` object. Display the
provider `asOf` independently from `observedAt`; a recently fetched closing quote
can have an old provider timestamp and `stale=true`. Preserve unknown values as
unknown. Failed submission requests that never became orders are outside this POC.

Opening an account/timeline/pricing view is audited. Poll the search/status APIs for
freshness; do not repeatedly poll audit-detail endpoints as background activity.

## Analytics endpoints

`GET /analytics/status` returns:

- `reportingTimezone`: `America/New_York`.
- `cutoffLocalTime`: `19:00`.
- `coverage`: same day, midnight inclusive through 19:00 exclusive.
- `pipeline`: source heartbeat, receipt time, latest event ID and approximate lag.
- `latestBatch`: newest attempted batch (`running`, `published`, or `failed`).
- `latestPublishedBatch`: the batch actually visible to dashboards.

Before ingestion/reporting starts, the corresponding objects are `null`. Render
an empty/loading state instead of fabricated zeros or an assumed current report.
A failed newer batch can coexist with an older successfully published report.

`GET /analytics/dashboards` lists configured `dashboardKey`, `title`, `embeddedId`.
The prepared keys are `business-overview`, `instrument-activity`, `client-activity`.

`POST /analytics/dashboards/{key}/guest-token` returns:

```json
{
  "guestToken": "short-lived-superset-token",
  "dashboardId": "configured-embedded-dashboard-uuid",
  "supersetUrl": "http://localhost:8088"
}
```

Use `@superset-ui/embedded-sdk`. Its `fetchGuestToken` callback should call this
endpoint again when the SDK renews the short-lived token. The existing application
JWT goes only to our API; the returned guest token goes to the embedding SDK.
No Superset username/password belongs in Angular. Configure the exact Angular
origin in `SUPERSET_EMBED_ORIGINS` and preserve a referrer policy that allows
Superset to check the permitted embedding origin.

```typescript
// Example handoff, to integrate into the Angular teammate's component/service.
const fetchEmbedding = () => firstValueFrom(
  http.post<{ guestToken: string; dashboardId: string; supersetUrl: string }>(
    '/api/v1/analytics/dashboards/business-overview/guest-token', {}
  )
);
const initial = await fetchEmbedding();
const embedded = await embedDashboard({
  id: initial.dashboardId,
  supersetDomain: initial.supersetUrl,
  mountPoint: dashboardElement,
  fetchGuestToken: async () => (await fetchEmbedding()).guestToken,
  dashboardUiConfig: { hideTitle: true, filters: { expanded: true } }
});
// On Angular component destruction: embedded.unmount().
```

The prepared dashboards support dates, instruments, security classes, sides and
clients. Segments/portfolio valuation are deferred. Filters change presentation;
they do not grant access to data.

## Errors

Explicit business errors use `ProblemDetail.detail`. Authentication failures from
the security filter may have an empty body, so provide a generic fallback.

| Status | Handling |
|---|---|
| 400 | Show invalid filter/reason detail |
| 401 | Use the existing single refresh flow, then return to login if necessary |
| 403 | Show insufficient staff permissions |
| 404 | Unknown order/dashboard/resource |
| 409 | Suspension state already changed; refresh current state |
| 502 | Trading service or Superset is unavailable; allow retry |
| 503 | Reporting database unavailable or dashboard initialization incomplete |

The internal Swagger page is available at port 8085 for the live generated schema.
