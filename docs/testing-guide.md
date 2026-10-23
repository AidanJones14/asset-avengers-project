# Test guide: what runs, why it matters, and how it works

This guide describes the repository's tests and the Jenkins PR pipeline. A test
suite contains individual cases; the suite inventory below identifies the source files
so reviewers can find individual assertions. Existing application tests
were retained; the CI work makes their execution, reports and failures required.

## What a passing build means

Jenkins tests a supported PR's proposed merge in temporary Docker environments.
Unit tests check rules and UI behavior with controlled dependencies; integration
tests check selected real service/database interactions; the new browser test
checks actual staff login/MFA/SSO. These layers complement each other. A mock-based
pass does not prove a real provider, PostgreSQL query or browser redirect works.

This is CI validation, not deployment. Test databases are disposable. Never point
the database suites at saved development or production data.

## Checks required by Jenkins

| Check | What and why | How it works / evidence |
| --- | --- | --- |
| PR policy | Avoid loading shared credentials for unsupported jobs or external forks. | `ci-pr-policy.sh` checks Jenkins CHANGE metadata; accepts same-repository PRs into dev and dev into main. |
| Gitleaks | Detect committed secrets before accepting a change. | Scans Git history with redacted output; nonzero exit marks the stage/build failed but Jenkins continues later checks. It does not prevent future console-log leaks. |
| Java tests | Protect trading rules, ownership, staff authorization and report behavior. | `ci-tests.sh java` runs Maven tests for both APIs in JDK 25 containers, creates Surefire and JaCoCo reports. PostgreSQL-only opt-in cases may be skipped; see limits below. |
| Auth tests | Protect credentials, MFA, reset codes, sessions and SSO tickets. | `ci-tests.sh auth` verifies ownership of the temporary auth DB, then runs Node 24/Vitest with MFA_TEST_DATABASE_URL. Email delivery is mocked. |
| Client and staff UI tests | Catch bad request contracts, state changes and role-specific rendering. | `ci-tests.sh web` installs lockfiles and runs both Angular suites with JUnit and V8/LCOV coverage. These are not full browser journeys. |
| Python tests | Check reporting schedules and CI safety/error handling. | `ci-tests.sh python` discovers `test_ci*.py` and pipeline `test_*.py`; mock Docker commands exercise failure paths without deleting real resources. |
| Image builds | Catch missing dependencies, build errors and packaging failures. | Builds client/auth/trading images and all four staff/reporting images. Building successfully alone does not prove runtime behavior. |
| Readiness | Avoid testing an application merely because its container started. | Polls database/auth/API/UI readiness. Spring's readiness group includes database health and returns status without dependency details. |
| Staff stack integration | Verify selected Kafka, reporting, API and Superset behavior across real services. | `verify-admin-stack.py` loads SQL fixtures into an isolated source DB, runs stack-check.py and http-check.py, then tears down the exact stack. |
| Staff browser authentication | Catch cookie, proxy, redirect, enrollment and logout bugs that mocks miss. | Temporary version-matched Playwright/Chromium container uses actual auth endpoints, fresh staff accounts and real TOTP codes; details below. |
| Coverage normalization | Ensure Sonar maps similarly named files to the right module. | `ci-lcov.cjs` validates and prefixes LCOV source paths; missing required coverage prevents scanning. Coverage describes executed lines, not proof of correctness. |
| SonarQube gate | Enforce the server's code-quality policy. | Uploads code, compiled Java classes and coverage; waits up to 300 seconds for the assigned quality gate. Failure/timeout fails Jenkins. |
| Cleanup and diagnostics | Keep failures debuggable without deleting unrelated data. | Publishes available XML/coverage/logs; removes only initialized CI resources. No global Docker prune. |

## CI helper test files

| File under scripts/tests | What it tests | Why / how |
| --- | --- | --- |
| test_ci_compose.py | Valid project names, initialization receipts, configuration failure, exact resource ownership and cleanup. | Substitute Docker commands record calls; unsafe or uninitialized requests must never reach destructive Docker commands. |
| test_ci_checks.py | Required failure propagation, logs, readiness probes and scanner gate options. | Runs the real shell helper against controlled fake commands and failure exit codes; successful tee/log writing must not hide a failed check. |
| test_ci_tests.py | Test-stage failure propagation, both Java modules, report cleanup and LCOV validation. | Simulated tool results and fixture reports check orchestration; these do not replace application suites. |
| test_ci_pr_policy.py | Accepted team PR routes, release route, rejected routes, missing metadata and forks. | Invokes the policy script with explicit environment values and checks its exit status. |
| test_ci_compose_compat.py | Port-free test configuration, rejected unexpected YAML layouts and service/job readiness. | Tests the generated base and mocked Docker state; supports old Compose without reset tags or --wait. |
| test_ci_staff.py | Fresh/private generated settings, staff builds, CI wiring and cleanup mode. | Controlled command execution checks that cleanup does not start services or target development projects. |
| test_ci_browser.py | Matching Playwright image, scoped network, secret forwarding and artifact handling. | Mocks the runner and checks its command/configuration. A passing guard proves wiring, not successful browser authentication. |
| test_ci_gitleaks.py | Exact reusable dummy values, continuation policy and explicit config/history-ignore loading. | Retains default detectors; different keys remain detectable while the two known dummy values are reusable across files. Real-scanner fixtures separately verify behavior. |

`verify_ci_isolation.py` is an additional opt-in real-Docker test. It starts two
separate temporary database projects, removes one, and verifies the other keeps
its data. This proves isolation against real Docker rather than only mock calls.
It is not automatically run by Python unittest discovery.

## Application test responsibilities

### Trading API: backend/src/test

- `order/OrderValidatorTest`: rejects invalid quantities/price combinations before execution.
- `order/OrderControllerTest` and `OrderServiceTest`: request/response behavior, caller/account ownership and service rules using controlled collaborators.
- `order/OrderFlowIntegrationTest`: Spring/database order submission and execution, cash/holding effects, idempotency and failure behavior with controlled pricing. Normal tests use the test database configuration; marked PostgreSQL cases require explicit opt-in.
- `order/OrderExecutionWorkerTest`: persisted open-order polling continues after individual failures and avoids unnecessary execution pricing while waiting.
- `order/QuoteCacheTest`: display reads reuse quotes while executions fetch fresh quotes; storage failures do not cause extra provider calls.
- `order/PositionReturnsTest`: weighted cost basis, realized/unrealized returns and missing acquisition-history behavior.
- `account/AccountHistoryTest`: reconstructs cash/holding book history without inventing market valuations.
- `integration/pricing/client/FauxnancePricingApiClientTest`: provider response mapping with controlled HTTP data, not a live-price accuracy test.
- `security/SecurityChainTest`, `EndpointAccessTest`, `MfaJwtValidationTest`: real Spring security configuration, endpoint role matrix and token/MFA policy. Invalid or insufficient tokens must fail closed.
- `security/ReadinessTest`: anonymous readiness returns only status; DB failure/refusing traffic makes readiness fail; other actuator routes stay protected.
- `bankaccount/BankAccountRequestValidationTest`: malformed UUIDs and invalid amounts become client errors before financial operations.
- `dispute/DisputeControllerTest`, `DisputeAccountSelectionTest`: dispute validation and investment-account/order ownership; another client's data cannot be selected.
- `tradingcontrol/AdminSuspensionServiceTest`, `TradingAdminCommandControllerTest`: suspension rules, verified actor attribution and audit behavior.
- `user/UserRoleTest`, `UserProvisioningServiceTest`: role mapping and verified identity/name provisioning; staff are not silently given trading accounts.
- `exception/OrderExceptionHandlerTest`: consistent status/message/error codes for trading refusals and unexpected failures.
- `EndgameApplicationTests`: starts the Spring application context as a basic configuration smoke test.

Example: a passing return calculation test protects cost-basis math; it does not
prove today's provider quote is correct. Quote acquisition and browser presentation
need their own checks.

### Staff API: internal-backend/src/test

- `InternalSecurityTest`: staff/client role boundaries and rejection of forged identity headers.
- `admin/AdminControllerTest`: authenticated admin commands, validation and actor handling with controlled dependencies.
- `admin/AdminAnalyticsRepositoryTest`: actual PostgreSQL queries for names, accounts, positions and activity. Requires `admin.test.jdbc-url` and companion credentials; ordinary Maven CI does not supply these, so this suite is opt-in.
- `analytics/ClientPortfolioFilterTest`: portfolio classes and safe, parameterized name searches.
- `analytics/ReportScheduleControllerTest`, `ReportScheduleServiceTest`: valid report times, verified actor and effective scheduling behavior.
- `analytics/SupersetWorkspaceTest`: VM/public URL construction, including explicit deployment prefixes.
- `exports/PdfDocumentTest`: readable, paginated PDF output that preserves evidence.
- `exports/PdfExportControllerTest`: PDF content type, safe download filename and cache controls.
- `exports/PdfExportServiceTest`: published report cutoff/history and invalid/unpublished report handling.

### Authentication: auth-server

- `auth.service.spec.ts`: registration validation, bcrypt hashes and authentication behavior with controlled repositories.
- `mfa.service.spec.ts`: encrypted enrollment secrets, tamper resistance, optional client versus required staff MFA, code/recovery replay and session-window rules. Database-dependent cases require disposable PostgreSQL, supplied in CI.
- `password-reset.service.spec.ts`: generic unknown-email responses, expiring/single-use codes and grants, old-password rejection, concurrency and session revocation without disabling MFA.
- `email.service.spec.ts`: official SDK contract, idempotency and retry/permanent-error classification, including Resend test-recipient restrictions. Does not send email.
- `superset-sso.service.spec.ts`: dedicated server-secret checks, one-use tickets, verified staff identity, session expiration and logout revocation against the test DB.
- `profile.controller.spec.ts`: authenticated profile changes without exposing password hashes or weakening MFA.
- `users/password-change.spec.ts`: atomic password updates and session revocation, including concurrent password changes.

The separate `test/app.e2e-spec.ts` uses `vitest.config.e2e.ts`; the normal CI
Vitest configuration includes `*.spec.ts`, not `*.e2e-spec.ts`. Existing manual
session/integration scripts are separate tools, not automatically additional Jenkins
stages. Real Resend inbox delivery is outside this pipeline.

### Client UI: frontend/src

Angular/Vitest cases control HTTP responses, time and state. They check:

- Auth page/interceptor/profile: form validation, optional MFA flow, session refresh coordination, identity and reset UI behavior.
- Instrument APIs/search/search page: request routes, encoded tickers, company aliases, ambiguous share classes and quote lookup selection.
- Order API/trade dialog/history: account-scoped submissions, request-key reuse, quantity/price controls and persisted statuses/errors.
- Portfolio store/overview/holdings/allocation: refreshed cash/positions, average cost versus current price, partial failures and allocation changes.
- Performance data/chart: saved history and actual observations rather than invented movement.
- Watchlist/search highlights: saved bookmarks, lookup/quote behavior, polling and recovery.
- Dispute form: investment-account selection, related orders and duplicate-submit protection.
- Profile/theme/portfolio preview: display/edit state, saved preferences and animation lifecycle.

### Staff UI: internal-frontend/src

`api.spec.ts` checks in-memory credentials, staff role restrictions, refresh
coordination and late-response handling. `pages.spec.ts` checks safe text rendering,
order polling/recovery/cleanup, filters and staff page interactions with controlled
API responses. These checks do not open a real Superset session.

## Python reporting and real-stack checks

`test_report_schedule.py` checks configured cutoffs, New York daylight-saving
changes, historical schedule selection and defaults with controlled database/time
inputs. A report at 19:00 New York must not use a hardcoded UTC offset year-round.

`stack-seed.sql` is fixture data, not a test. `stack-check.py` checks the real
Kafka/reporting path; `http-check.py` checks actual staff HTTP authorization,
reporting/dashboard and Superset guest-token behavior. The latter signs isolated
fixture tokens, so it does not prove login. The browser journey below fills that
specific gap using actual authentication.

`integration.py` and `demo.py` are additional real PostgreSQL projection/report and
demo-publication checks, launched by their verification tools rather than unittest
discovery. They exercise database-specific SQL, replay/idempotency, permissions and
report/demo totals. They must use their disposable fixtures, not saved user data.

## Real staff browser journey

`internal-frontend/tests/auth-journey.e2e.ts`, selected by
`playwright.ci.config.ts`, runs after stack checks:

1. Reject an incorrect password.
2. Log in as each fresh ADMIN/ANALYST identity and show mandatory enrollment.
3. Read the enrollment secret displayed by the real UI and calculate a real TOTP.
4. Verify it and acknowledge recovery codes; check the role-specific workspace.
5. For the analyst, click Open Superset workspace and verify the resulting real
   Superset session identifies that analyst.
6. Log out of staff and confirm the Superset session is refused on its next request.
7. Log in again, require MFA without enrolling again, reject an incorrect code,
   accept a fresh code and log out.

No permanent MFA seed, injected browser JWT or mocked HTTP authentication is used.
Accounts are provisioned in the disposable auth DB, and normal endpoints verify
passwords and codes. Already-consumed TOTP windows cannot be replayed. The runner
stops completed ingestion workers before Chromium to reduce concurrent memory use.

JUnit and masked failure screenshots are retained. Traces/video are disabled and
raw accessibility snapshots are removed because enrollment pages contain secrets.
The browser image matches the locked Playwright version. Jenkins needs Docker and
registry/npm access, not a host browser installation.

Other browser files are separate: `console.spec.js` uses the development Playwright
configuration; `live-stack.mjs` is the older token-based chart smoke check. Neither
is a substitute for the new real authentication journey.

## How to run and read results

Safe CI helper tests (no real Docker stack):

```bash
python3 -m unittest discover -s scripts/tests -p 'test_ci*.py' -v
python3 -m unittest discover -s admin-analytics/pipeline/tests -p 'test_*.py' -v
```

Java suites: JDK 25, `mvn -f backend/pom.xml clean test` and
`mvn -f internal-backend/pom.xml clean test`. Node suites: Node 24, run `npm ci`
then `npm run test:ci` inside each UI/auth module. Auth DB cases need a disposable
`MFA_TEST_DATABASE_URL`; CI supplies this through its helper. Do not run the Linux
containerized npm install helpers over your Mac's existing dependencies.

For Jenkins setup, exact isolation rules and local staff-stack commands, see
[jenkins-ci.md](jenkins-ci.md). Use a PR build on the VM for the complete pipeline.
JUnit shows individual passed/failed/skipped cases; Surefire and browser XML identify
failures. JaCoCo/LCOV show coverage; SonarQube evaluates its assigned quality gate.
A skipped test is not a passing test. An absent report after an early failure is
not proof the suite ran.

## Verification status and remaining limits

During this CI update, 47 CI guard cases passed. Earlier staff images and nonbrowser
stack checks succeeded locally. Playwright loaded/discovered the new journey, but
local combined-stack startup stalled before browser assertions on the resource-
constrained Docker VM. The browser journey and complete new Jenkins-machine run
remain unverified. PostgreSQL-only opt-in Java cases are not all enabled by the
normal CI Java action. Client signup/reset browser journeys and real email inbox
delivery remain outside the staff browser check. No deployment is performed.
