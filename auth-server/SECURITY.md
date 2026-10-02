# Auth flow security review

A lighter-scope review of the auth service against the OWASP authentication items and this sprint's focus areas (token leakage, replay, timing). Each row points at the code responsible. **Status** is filled in as the TODOs are implemented and verified by `npm run test:integration`.

## Broken authentication

| Risk | Defence | Where | Status |
|---|---|---|---|
| Passwords readable after a breach | bcrypt, cost 10, random salt per hash | `AuthService.register` | TODO |
| Same password → same hash | bcrypt salts automatically; two users with one password get different hashes | `AuthService.register` | TODO |
| SQL injection | Every query uses `$1` placeholders; no string-built SQL | `users.repository.ts`, `sessions.repository.ts` | Done |
| Account enumeration via timing | Unknown emails still run `bcrypt.compare` against `DUMMY_HASH` | `AuthService.login` | TODO |
| Account enumeration via message | One message for unknown email and wrong password | `AuthService.login` | TODO |
| Account enumeration via register | `409 email is already registered` does reveal existence. Accepted for this PoC; the alternative is email verification | `AuthService.register` | Accepted |
| Credential stuffing / brute force | 20 requests per 15 minutes per IP, counted separately for each `/auth/*` route (so 20 login attempts) | `ThrottlerModule` in `app.module.ts` | Done |
| Weak passwords | Minimum 12 characters; max 72 (bcrypt's limit, refused rather than truncated) | `RegisterDto` | Done |
| Weak or hardcoded signing secret | `JWT_SECRET` required, ≥ 32 characters, no fallback; startup fails without it | `config/env.ts` | Done |
| Algorithm confusion (`"alg": "none"`) | Sign and verify with `algorithms: ['HS256']` only | `TokenService` | TODO |

## Broken access control

| Risk | Defence | Where | Status |
|---|---|---|---|
| Client grants itself a role (mass assignment) | `forbidNonWhitelisted` rejects any field not on the DTO; register always assigns `CLIENT` | `app.setup.ts`, `RegisterDto`, `users` default | Done |
| Stale roles in long sessions | Roles are re-read from the DB on every refresh, so a change applies within one access-token lifetime | `AuthService.refresh` step 5 | TODO |
| Using someone else's data | Spring identifies the client by the token's `sub`, never by a request parameter | Spring `/me/...` endpoints | Spring side |

## Token leakage

| Risk | Defence | Where | Status |
|---|---|---|---|
| Passwords or tokens in logs | `logAuthEvent(event, userId)` has no parameter for either; request bodies are never logged | `common/log-auth-event.ts` | Done |
| Database leak exposes live sessions | Only `sha256(refreshToken)` is stored | `TokenService.hashRefreshToken`, `refresh_tokens` table | TODO |
| Tokens in URLs (browser history, proxy logs) | Tokens only travel in JSON bodies and the `Authorization` header | `AuthController` | Done |
| JWT contents are readable | Claims are only `sub`, `email`, `roles`; a JWT is encoded, not encrypted (lecture 13) | `TokenService.issueAccessToken` | TODO |
| Refresh token readable by page scripts | Stored in `sessionStorage`; an XSS bug could read it. Mitigated by rotation + idle timeout. An httpOnly cookie would remove this risk | Frontend | Known limit |

## Replay

| Risk | Defence | Where | Status |
|---|---|---|---|
| Stolen refresh token reused | Every refresh token works once; reuse revokes the whole session | `AuthService.refresh` step 3, `SessionsRepository.rotate` | TODO |
| Two requests race with one token | `rotate` marks the token used only `WHERE used_at IS NULL`; the loser is treated as a replay | `SessionsRepository.rotate` | Done |
| Stolen access token | Lives at most `ACCESS_TOKEN_TTL` (15 min); cannot be revoked earlier because Spring verifies it locally | — | Known limit |

## Session lifetime

| Rule | Value | Where |
|---|---|---|
| Access token | 15 minutes | `ACCESS_TOKEN_TTL` |
| Idle timeout (no refresh) | 30 minutes | `SESSION_IDLE_TIMEOUT_MINUTES` |
| Absolute lifetime | 12 hours | `SESSION_MAX_AGE_HOURS` |
| Logout | Revokes the session; issued access tokens expire on their own | `AuthService.logout` |
