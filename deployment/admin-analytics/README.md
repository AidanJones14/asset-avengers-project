# Admin and analyst Docker Compose stack

This folder contains deployment configuration for the admin/analyst system.
`admin-analyst-stack.compose.yml` tells Docker how to build and run the staff services together; it
is not application source code. See [which Compose file to use](../README.md).

This folder owns the admin/analyst Docker Compose project. Start the client stack
from the repository root first, then follow [the setup guide](../../docs/admin-analytics/setup.md).

- `admin-analyst-stack.compose.yml`: staff test UI (port 8086), reporting PostgreSQL, Kafka, Python jobs, internal API and Superset.
- Repository-root `.env.example`: shared configuration template for both stacks.
  The real repository-root `.env` supplies all settings; no local env file is needed.
- `init-databases.sh`: separate least-privilege component logins and Superset metadata database.
- `admin-analyst-tests.override.yml`: isolated verification override; does not use the live trading database.
- `test-runtime.Dockerfile`: packages a previously tested jar for the verification stack.
