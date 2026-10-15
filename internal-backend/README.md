# Admin and analyst backend

This folder is the independent Spring Boot backend shared by the admin and analyst.
The name `internal` means staff-facing: both roles use this service, with different
permissions. The `admin/` and `analytics/` Java packages separate their features.
This is the folder to open when changing staff API code.
It owns its Maven dependencies, Dockerfile, configuration, security and tests.
It does not import or build `backend/`.

Code lives under `src/main/java/com/avengers/internal/`:

| Folder | Responsibility |
|---|---|
| `admin/` | Client/account audit search, order timelines, pricing, exports and command forwarding |
| `analytics/` | Report status, dashboard registry and Superset guest tokens |
| `security/` | Staff JWT verification and ADMIN/ANALYST permissions |
| `common/` | Shared internal API error handling and JDBC response mapping |

This service reads only the reporting database. Supported admin writes use HTTP
to reach `backend/`'s `tradingcontrol` package, which locks and updates the source
account/instrument and commits the audit event in the same transaction. The small
response DTOs here describe that HTTP contract; they do not share trading entities.

Build and test from this folder:

```bash
mvn clean package
docker build -t asset-internal-backend:poc .
```

Or, from the repository root: `mvn -f internal-backend/pom.xml clean package`.
Runtime settings are supplied by the separate Compose stack in
`deployment/admin-analytics/admin-analyst-stack.compose.yml`.

[API contract](../docs/admin-analytics/frontend-api.md) ·
[Setup](../docs/admin-analytics/setup.md) ·
[Architecture](../docs/admin-analytics/architecture.md)
