# Staff stack

This folder owns the admin/analyst Docker Compose project. Start the client stack
from the repository root first, then follow [the setup guide](../../docs/admin-analytics/setup.md).

- `compose.yml`: staff test UI (port 8086), reporting PostgreSQL, Kafka, Python jobs, internal API and Superset.
- `.env.example`: placeholder configuration for this stack.
- `init-databases.sh`: separate least-privilege component logins and Superset metadata database.
- `compose.test.yml`: isolated verification override; does not use the live trading database.
- `test-runtime.Dockerfile`: packages a previously tested jar for the verification stack.
