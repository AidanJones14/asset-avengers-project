# Asset Avengers Trading Platform

## Documentation

- [Complete project guide](docs/project-guide.md): architecture, login, databases, orders, live updates and setup.
- [Code map](docs/code-map.md): where each feature starts and which files it calls.
- [Design decisions](docs/design-decisions.md): why the components and data flows work this way.
- [Database reference](DB/README.md): table ownership, relationships, triggers, views and seed files.
- [Persistence and API usage](docs/persistence-and-api-usage.md): saved accounts and quote credit controls.
- [Order processing](docs/order-processing.md): validation, reservations and execution.
- [Admin and analyst backend](docs/admin-analytics/README.md): separate staff API, pipeline, dashboards and Compose setup.

## Repository Structure

- `backend/` - Client trading API and business logic
- `internal-backend/` - Independent admin/analyst backend, with its own Maven project and Dockerfile
- `internal-frontend/` - Simple admin/analyst test console (port 8086); separate from the client Angular app
- `admin-analytics/` - Staff Python pipeline and Superset configuration
- `docker/admin-analytics/` - Separate staff Docker Compose stack
- `frontend/` - Angular application
- `auth-server/` - NestJS login, sessions and token service
- `DB/` - Database schemas and catalogue/auth fixtures
- `scripts/` - SQL seed synchronization and database verification
- `docker-compose.yml` - Current local stack and persistent database storage
- `README.md` - project overview and team workflow

## Local setup and catalogue changes

Copy `.env.example` to `.env` and supply database credentials, a shared JWT secret
and the pricing API key. Start the stack with `docker compose up -d --build` and
open `http://localhost:8084`. Use `docker-compose.yml`; `new-compose.yml` is obsolete.

The instrument catalogue source is `DB/instruments.seed.sql`. After editing it, run:

```bash
python3 scripts/generate-instrument-seed.py
python3 scripts/generate-instrument-seed.py --check
```

Compose loads the schema/catalogue when trading database storage is first initialized.
For an existing local database, apply updates with `bash setup-test-db.sh`; normal
restarts keep saved accounts and do not rerun initialization scripts. New portfolios
start empty with zero cash. Company-name search uses the saved catalogue and supports
matching choices in market watch, Search & Trade and the trade dialog. Click a
holding's name to view average cost, total value, gain/loss and saved purchase history. The auth seed includes eight local development credentials.
See the [project guide](docs/project-guide.md) for database relationships, source-code
entry points, live polling intervals, order execution, tests and current limitations.

Before pushing, include the new guide, SQL seed, helper scripts and new Java/Angular
files along with modified files. Keep `.env`, generated build output and database
storage out of the commit.

## Team
- Aidan Jones
- Cameron Kelly
- Anika Ahmed
- Andrei Zubek
- Christopher Saez

## Branching Strategy
### Git Flow
- We decided to use git flow to keep individual development on feature branches, which will need to be kept up to date as changes are continuously merged into a development branch. When a sprint is completed, we will make a pull request to the main/prod branch, review all changes as a group, and then merge.

## Notes

- Order validation, separate execution, setup and tests: [Order processing](docs/order-processing.md).
- The backend was reorganized from the generated Spring Initializr folder into `backend/` to keep the repository ready for the Angular frontend.
- IDE files and build output should stay untracked through the root `.gitignore`.
