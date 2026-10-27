# Spring Boot implementation review

Reviewed October 15, 2026 against the current project guide, trading API and separate
staff API. This is a focused review of HTTP boundaries, dependency injection,
validation, security, transactions, audit integration and display caching. It is not
a claim that every class or reporting deployment has been exhaustively audited.

## Changes applied

| Area | Previous implementation | Updated implementation |
| --- | --- | --- |
| Order controller | Two constructors, a nullable ownership dependency and separate owned/unowned wrapper methods | One generated constructor, final dependencies and one handler per route; every order operation keeps its ownership checks |
| Constructor boilerplate | Handwritten assignment-only constructors in `OrderController`, `WatchlistController` and `CurrentUserService` | Lombok `@RequiredArgsConstructor` generates the constructor; Spring injects its dependencies |
| Account transactions | Class-level `@Transactional` plus an identical method-level annotation | Keep the class-level transaction and remove the duplicate method annotation; externally called `userId` and `requireAccount` still enter a transaction |
| Banking request validation | `@DecimalMin` accepted null, and malformed bank UUID strings reached service parsing | `@NotNull`, `@DecimalMin`, `@Digits` and UUID `@Pattern` are evaluated by the existing controller `@Valid` before business code runs |
| Standard API errors | A general runtime handler could turn validation and parameter-binding failures into 500s | Extend Spring MVC `ResponseEntityExceptionHandler`, retaining normal HTTP status/header handling and adding readable field-validation details |
| Unexpected errors | Internal exception messages were returned to browsers; a substring check guessed whether an error was an instrument lookup failure | Log unexpected exceptions with Lombok `@Slf4j`, return a generic 500 detail and use typed validation/HTTP exceptions for expected failures |

`@RequiredArgsConstructor` and `@Slf4j` are **Lombok** annotations, not Spring
annotations. Lombok was already a dependency; no new library was introduced.
An ordinary explicit constructor is equally valid when it improves clarity.
Spring needs no `@Autowired` on a bean's only constructor. Existing constructors
that perform configuration or support distinct test dependencies are not automatically
redundant.

The banking amount contract is now explicit: a non-null positive amount of at least
0.01, at most 16 integer digits and at most two fractional digits. Values with excess
fractional digits are rejected rather than silently rounded. Validation error bodies
contain `code: VALIDATION_ERROR` and an `errors` list with field/message entries.

## Explicit code that still has a purpose

- `@AuthenticationPrincipal Jwt` supplies the verified caller. It does not check
  ownership of a requested trading account. `CurrentUserService.requireAccount`
  therefore remains necessary.
- `SecurityFilterChain` already checks ADMIN/ANALYST routes in both Java services.
  Adding identical `@PreAuthorize` annotations everywhere would repeat that policy.
  Service-level authorization can be useful for future non-HTTP callers, but requires
  deliberate boundaries, `@EnableMethodSecurity` and tests of the proxied service.
- `@Transactional` defines an atomic unit of work; it does not replace row locks.
  Account/order locks and cash/share reservation checks prevent competing trades
  from spending the same resources.
- `OrderAuditRecorder.observed` uses `Propagation.MANDATORY`; the rejected-attempt
  path uses `REQUIRES_NEW`. The separate bean is intentional: it makes Spring's
  transaction proxy intercept those calls and lets rejected evidence survive the
  outer rollback. Combining the paths into same-class calls would change behavior.
- SQL audit/ledger/outbox triggers capture committed source changes regardless of
  which application path writes them. JPA lifecycle annotations do not cover direct
  SQL writes, so they are not equivalent replacements.
- Staff uses JDBC projections from reporting views; trading uses JPA entities.
  These serve different database contracts. Sharing entity classes between the
  independently deployable services would introduce unnecessary coupling.
- Order validation checks conditional market/limit/stop fields, decimal precision,
  holdings, reservations and affordability. Simple bean constraints complement those
  rules; they do not replace transaction-aware business validation.

## Follow-up opportunities

| Priority | Opportunity | Boundary to preserve |
| --- | --- | --- |
| High | Replace banking's remaining generic `RuntimeException`/`IllegalArgumentException` business failures with typed 400/403/404 errors | The existing mismatch, missing-bank and insufficient-funds cases can still be reported as generic 500 errors; do not globally map all programming exceptions to 400 |
| Medium | Replace the handwritten quote cache with a configured bounded cache provider if cache complexity grows | Keep the 60-second TTL, 512-entry bound, per-symbol request sharing, valid-result policy, and mandatory provider fetch for execution; `@Cacheable` alone does not specify expiry or size |
| Medium | Remove or isolate unused legacy account creation and profile-gated holdings endpoints | Preserve current routes and prohibit exposing unscoped legacy holdings queries to clients |
| Medium | Consolidate typed pricing/security configuration where it reduces duplicated `@Value` strings | The two services remain independent and must continue checking issuer, audience, signature and token lifetime |
| Medium | Consider splitting the growing banking snapshot query from banking command logic | Keep repeatable-read consistency and the saved purchase-history/return rules |
| Low | Standardize handwritten constructors and imports gradually | Use Lombok where already supported and useful; avoid adding a dependency to the staff service solely to remove short constructors |

A cache migration is intentionally not included in this refactor. Spring's cache
annotations operate through proxies, so annotating a method invoked from another
method on the same instance does not automatically enable interception. Cache tests
must prove expiry, concurrent misses, fresh execution fetches and failure behavior.

## Verification

The root Maven reactor passed: 144 tests passed and six optional database-specific
tests were skipped (150 discovered). This includes the new invalid banking amount,
malformed UUID and updated controller ownership tests, plus the staff service suite.
The trading suite also passed all 122 tests against the actual SQL schema in a
disposable PostgreSQL database, with no skipped tests. Unchanged Angular, NestJS and staff browser suites were
not rerun for this Java-only refactor. No database schema, seed or Compose change is
required, and this review does not rebuild or restart running Docker services.

## Framework references

- [Spring constructor injection](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html)
- [Spring MVC error responses](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html)
- [Spring transaction annotations and proxies](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)
- [Spring Boot cache providers](https://docs.spring.io/spring-boot/reference/io/caching.html)
