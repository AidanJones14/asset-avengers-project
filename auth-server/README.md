# Authentication service

For its connections to both Java APIs and the client/staff UIs, see the
[project guide](../docs/project-guide.md), [code map](../docs/code-map.md#authentication-auth-server)
and [database reference](../DB/README.md#auth-tables).

NestJS service for registration, bcrypt password verification, signed access JWTs,
refresh-token rotation and session revocation. The current auth PostgreSQL database
stores credentials, roles, sessions and hashed refresh tokens. It stores no portfolio data.

See the [complete project guide](../docs/project-guide.md) for architecture and database relationships.

## Run and test

The repo-root `.env` supplies settings listed in `../.env.example` and `src/config/env.ts`.
The JWT secret must match the Spring backend. No SQL migration npm scripts currently exist.

```bash
# From the repository root: build the configured database/auth services.
docker compose up -d --build auth-db auth-server

# From auth-server, after installing locked dependencies:
npm ci
npm run start:dev
npm test
npm run test:e2e
```

Auth DB schema: `../DB/auth_db.schema.sql`. Development login fixtures:
`../DB/auth_db_test_data.sql`. Docker applies those files only on initial empty-volume startup.
Do not delete database storage to perform a normal rebuild.

Swagger: `http://localhost:3000/api`. Routes: `POST /auth/register`, `/auth/login`,
`/auth/refresh`, `/auth/logout`. Health: `GET /health/live`, `/health/ready`.
The Angular app keeps access tokens in memory and refresh tokens in per-tab sessionStorage.
Reusing a rotated refresh token revokes its session. Logout does not delete trading data.

Signup requires `firstName` and `lastName` as well as email/password (trimmed,
nonblank, max 100 characters each). Auth `users` owns these names. Login/refresh
JWTs carry `given_name`, `family_name` and full `name`; missing legacy names fall
back to email in the UI. Existing auth volumes need the updated auth schema;
`bash scripts/start-project.sh` applies it before rebuilding services. Trading
copies signed name claims for downstream staff searches; it does not own names.
