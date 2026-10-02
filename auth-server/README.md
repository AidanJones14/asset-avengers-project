# auth-server

NestJS + TypeScript service that registers users and issues the JWTs the Spring API accepts. It has its own Postgres database for credentials, so password hashes never reach the trading DB. Built to the Sprint 8 lectures (`local/Auth_Lectures`, modules 09–15).

## Run it

```bash
npm install
npm run db:up         # Postgres 17 on localhost:5433 (values from ../.env)
npm run migrate:up    # creates users, sessions, refresh_tokens
npm run start:dev     # http://localhost:3000, restarts on save
```

Then open http://localhost:3000/api for the Swagger UI (raw document at `/api-json`).

Settings come from the repo-root `../.env`; `.env.example` lists the keys. `JWT_SECRET` must be the same string Spring uses for `jwt.shared-secret`.

Use `start:dev` (the Nest CLI, which compiles with `tsc`), never `tsx`: tsx can't emit the decorator metadata Nest's dependency injection needs, so every request would fail (lecture 09).

## Scripts

| Script | What it does |
|---|---|
| `start:dev` | Compile and run, restarting on every save |
| `build` / `start:prod` | Compile to `dist/` / run the compiled output |
| `test` | Unit tests (`src/**/*.spec.ts`) with vitest, a Jest-compatible runner and the Nest 12 default |
| `test:e2e` | Boots the app with a fake DB and checks routing, validation, errors, rate limit, Swagger |
| `test:integration` | Full end-to-end run against the real auth DB and the running Spring API (lecture 15) |
| `db:up` / `db:down` | Start / stop the auth Postgres container |
| `migrate:up` / `migrate:down` | Apply all / undo the last SQL migration |
| `migrate:create <name>` | New empty SQL migration in `migrations/` |
| `lint` / `format` | oxlint / prettier |

## How the files fit together

**Startup** (once). `main.ts` calls `NestFactory.create(AppModule)`:

1. `app.module.ts` → `ConfigModule` loads `../.env` and validates it with `config/env.ts`. Startup stops here if anything is missing.
2. `database/database.module.ts` creates the one `pg.Pool`, injectable as `PG_POOL`.
3. `auth/auth.module.ts` lists the auth classes; Nest creates each one once, passing constructor arguments in: repositories get the pool, `AuthService` gets the repositories + `TokenService`.
4. `app.setup.ts` adds the app-wide pieces: JSON body limit, helmet, CORS, the global `ValidationPipe`, `ApiErrorFilter`, Swagger.

**Every request**:

```
JSON parser (10 kB) → helmet/CORS → ThrottlerGuard (/auth only) → ValidationPipe (checks body against the DTO)
  → AuthController method → AuthService → repositories → Postgres
  any exception at any step → ApiErrorFilter → application/problem+json
```

| File | Role | Spring equivalent |
|---|---|---|
| `auth/dto/requests.dto.ts` | Request bodies + validation rules | DTO + Bean Validation |
| `auth/dto/responses.dto.ts` | Response shapes, for Swagger only | — |
| `auth/auth.controller.ts` | Routes → service calls | `@RestController` |
| `auth/auth.service.ts` | The four auth flows (**your TODOs**) | `@Service` |
| `auth/token.service.ts` | Sign/verify JWTs, make/hash refresh tokens (**your TODOs**) | `@Service` |
| `users/users.repository.ts`, `auth/sessions.repository.ts` | Parameterized SQL | Repository |
| `common/api-error.filter.ts` | Any exception → ApiError body | `@ControllerAdvice` |
| `common/log-auth-event.ts` | The only way auth events get logged | — |
| `migrations/*.sql` | Schema | Flyway |

## Your TODOs, in order

Each stub throws `501 Not Implemented` and has numbered steps in its comments.

1. `TokenService.newRefreshToken`, `hashRefreshToken` (one line each)
2. `AuthService.register` (lecture 12). Then `POST /auth/register` returns 201 and the e2e test `a valid register body reaches AuthService` needs its expected status changed to 201.
3. `TokenService.issueAccessToken`, then `AuthService.login` (lectures 12–13)
4. `TokenService.validateAccessToken`, then the three lecture-14 tests in `auth.service.spec.ts`
5. `AuthService.refresh`, `AuthService.logout`, and the three session tests
6. `npm run test:integration` until it prints `ALL STAGES PASSED`, then fill the Status column of `SECURITY.md`

## Sessions: staying logged in while active

- **Access token**: JWT, 15 minutes, sent to Spring as `Authorization: Bearer`. Spring checks it locally and never calls this service.
- **Refresh token**: opaque random string. `POST /auth/refresh` swaps it for a **new pair**; each refresh token works once.
- A session ends after **30 minutes without a refresh** (idle), after **12 hours** regardless (absolute), on **logout**, or when an already-used refresh token is presented (**replay**, which revokes the whole session).
- Only `sha256(refreshToken)` is stored.

API contract:

| Endpoint | Body | Success |
|---|---|---|
| `POST /auth/register` | `{email, password}` | 201 `{id, email, registered: true}` |
| `POST /auth/login` | `{email, password}` | 200 `{accessToken, refreshToken}` |
| `POST /auth/refresh` | `{refreshToken}` | 200 `{accessToken, refreshToken}` |
| `POST /auth/logout` | `{refreshToken}` | 200 `{loggedOut: true}` |

Errors are `application/problem+json` with `{title, status, code, detail?, errors?}`, the same ApiError shape as the Spring API.

### For the frontend team

1. After login, keep the access token **in memory** and the refresh token in **`sessionStorage`** (memory alone logs the user out on reload).
2. Add one HTTP interceptor: when Spring answers 401, or just before the access token's `exp`, call `/auth/refresh` **once** even if several requests are waiting, store the new pair, and retry them. If refresh answers 401, go to the login page.
3. "Activity" means a refresh call, so no mouse/keyboard tracking is needed for normal use. **Decision for you:** background polling (e.g. quotes) would keep an idle tab logged in until the 12-hour cap. If that's unwanted, only refresh when the user has clicked or typed in the last N minutes.
4. Two tabs sharing one refresh token and refreshing at the same moment look like a replay and both get logged out. `sessionStorage` is per tab, but "Duplicate tab" copies it.

## Talking to Spring

The two services agree on exactly two things: the secret and the claims (`sub` = user UUID, `email`, `roles`, `iss`, `aud`, `iat`, `exp`).

- The secret is used as UTF-8 text on both sides: `jwt.sign(..., secretString)` here, `sharedSecret.getBytes(UTF_8)` in `SecurityConfig.java`. Don't Base64-decode it on either side.
- Spring maps `roles` to authorities with a `ROLE_` prefix, so `hasRole('ADMIN')` matches `"roles": ["ADMIN"]`.
