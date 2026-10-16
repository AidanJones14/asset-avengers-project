# Why the project is connected this way

These decisions describe the implementation checked on October 15, 2026. They
explain the tradeoffs, not a claim that the local deployment is production-complete. Use the
[project guide](project-guide.md) for the flows and [code map](code-map.md) for files.

| Decision | Why it was chosen | Tradeoff / boundary |
|---|---|---|
| Separate auth service/database | One credential/session implementation serves client and staff; trading never stores passwords | JWT secret, issuer and audience must agree across services; logout revokes refresh capability but issued access JWTs last until expiry |
| Stable UUID in JWT `sub` | Login/reload resolves the same saved trading account without trusting a supplied email/account ID | Databases cannot enforce cross-database FKs; first client use creates the local identity |
| Separate client and staff backends | Keeps client execution ownership independent from staff lookups, exports and Superset integration | Two Java services to run; JSON contracts must stay compatible |
| One internal backend for admin and analyst | Shared JWT verification, reporting connection and deployment reduce local deployment plumbing | Package/route permissions separate the roles; separate deployment can come later if required |
| Commands return to the trading API | Suspension enforcement and audit commit with the authoritative state | Staff needs the trading service for commands, and the copied read state may lag |
| Angular client plus small standalone staff test UI | Existing client remains intact; staff endpoints can be exercised before the team's final Angular portal is ready | Test UI is intentionally simple; staff reload requires another login |
| Nginx proxies `/auth` and API paths | Browser auth and API requests use one origin; container addresses remain server-side | Browser-facing Superset URL and iframe origins still need explicit configuration |
| DTOs/mappers at Java HTTP boundaries | Keep request validation and response shape separate from persisted entities and internal fields | Small amount of mapping code; staff duplicates only contract types, not trading JPA entities |
| JPA for trading, JDBC for staff reads | Trading uses domain entities/transactions; staff queries explicit SQL projections/views | SQL and row mappings must evolve together and be checked against PostgreSQL |
| Persist orders before executing | Accepted commitments survive restart; execution can wait for limit/stop conditions | Acceptance is not a fill; screens must refresh later status |
| Row locks and one settlement transaction | Serialize conflicting account/order actions and commit cash, holdings and fill together | Lock contention/deadlocks can cause retry; no distributed exchange matching |
| Cached display prices, new execution fetch | Share provider requests without filling from an old UI estimate | Latest fetched provider data may still be a closing/stale quote under this simulator's policy |
| Recorded decimal settlement amounts | Preserve exact cash movements despite price/quantity rounding | Reporting must reuse fill cash, not recompute it independently |
| SQL constraints and audit triggers | Enforce invariants and capture committed changes regardless of which source path writes them | H2 tests alone cannot prove PostgreSQL trigger behavior |
| Transactional outbox instead of Kafka calls during trades | Source commit retains the event even if Kafka/reporting is unavailable | Delivery is asynchronous and may repeat; outbox retention/monitoring is future work |
| One Kafka partition and publisher lease | Keep local deployment stream ordering and deployment understandable | One broker is not highly available; scaling requires an ordering/recovery design |
| Consumer transaction before offset commit | Event deduplication and derived rows succeed together | Poison events stop/retry the stream; no automatic dead-letter process yet |
| Record original quotes | An investigation needs the price observation actually considered at the time | Historical evidence cannot be manufactured from today's quote |
| Failed quote evidence in a separate transaction | A failed execution attempt must remain visible after rollback | Evidence has no order FK to avoid waiting on the outer transaction; app IDs must be correct |
| Separate reporting database | Staff searches and charts use copied facts and published datasets | Eventual consistency; UI exposes freshness instead of implying live state |
| Immutable report versions plus one published pointer | Readers retain the last successful report while a replacement builds or fails | Requires storage/retention policy later; old batches are intentionally retained |
| Shared configurable same-day cutoff, initially 7 PM | Staff choose report time and cutoff; append-only changes start next local day | Coverage is midnight to cutoff, not a full calendar day; ingestion stays continuous and after-cutoff trades remain audit-only |
| Superset guest tokens for approved dashboards | Reuse prepared charts while keeping service/database credentials on the server | All authorized staff currently share the same reporting scope; per-client staff access would require server-side row restrictions |
| Source snapshots labelled as snapshots | Recover existing known facts without claiming an invented event history | Earlier quotes/steps and after-balances may remain unknown |
| Source catalogue plus generated fixture | One editable ticker list prevents setup and tests drifting apart | Run the generator/check after catalogue changes; company-name search is limited to saved metadata |
| Separate deployment definitions, one ignored root environment file | Client and staff can run independently while sharing one documented configuration location | Root Compose alone does not start port 8086; use the staff stack under deployment/admin-analytics and preserve volumes |

## Three distinctions to keep in mind

**Current state versus history:** accounts, holdings and order status change.
Fills, banking transactions, audit facts and batch facts preserve recorded history.
Portfolio display prices may change without changing purchase cost or cash.

**Application identity versus deployment identity:** a staff JWT identifies the
human and authorizes a route. Database logins restrict what that running component
can do. A Superset guest token authorizes a specific dashboard; it is not a trading
API login or the Superset author's password.

**Operational support versus audit scope:** trading implements cancellation,
amendments and stop activation. The requested local deployment audit captures submitted orders,
execution rejection attempts and successful fills. Do not infer a full historical
timeline from the existence of an operational status column.
