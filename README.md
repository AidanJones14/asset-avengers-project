# Asset Avengers Trading Platform

## Documentation

- [Complete project guide](docs/project-guide.md): architecture, login, databases, orders, live updates and setup.
- [Persistence and API usage](docs/persistence-and-api-usage.md): saved accounts and quote credit controls.
- [Order processing](docs/order-processing.md): validation, reservations and execution.

## Repository Structure

- `backend/` - Spring Boot API and business logic
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
start empty with zero cash. The auth seed includes eight local development credentials.
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
