# Backend and database verification

Use Java 25 and Maven. See [the project guide](../docs/project-guide.md) for current behavior.
There is no automatically funded John/Jane demo portfolio in the current SQL seed.

## Default tests

From `backend/`, provide a test-only JWT secret and run:

```bash
JWT_SECRET=local-test-only-secret-at-least-32-characters mvn test
```

Tests use H2, mock pricing and disable the execution timer. They create their own
isolated test records. A PostgreSQL-only append-only-trigger check is skipped here.

## Actual PostgreSQL schema

From the repository root, with the local `endgame_postgres` container running:

```bash
python3 scripts/generate-instrument-seed.py --check
python3 scripts/verify-db-schemas.py --check-live
python3 scripts/run-backend-postgres-tests.py
```

The schema verifier loads schemas and seeds twice into temporary databases, checks
fresh startup counts, and compares live columns/defaults/constraints read-only. The
backend runner creates another temporary database, applies the real endgame SQL,
and runs Hibernate schema validation plus the complete backend suite against it.
Both remove only their own disposable databases. They do not reset saved user data.

Use `--java-home PATH` if Maven would otherwise use another Java version, and
`--container NAME --port PORT` for a different Docker PostgreSQL configuration.

To apply trading DDL/catalogue updates to the configured local database without
resetting saved data, use `bash setup-test-db.sh`. The `--reset` option is explicitly
destructive and is not part of ordinary test verification.
