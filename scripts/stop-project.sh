#!/usr/bin/env bash
# Stop both project stacks and permanently remove their Compose-managed volumes.
# Stop staff first because its services use the client stack's trading network.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ $# -eq 1 && ( "$1" == --help || "$1" == -h ) ]]; then
  echo 'Usage: bash scripts/stop-project.sh'
  echo 'Stops client, admin, analyst, reporting and Superset services.'
  echo 'Permanently deletes their database and Kafka volumes, including saved users and trades.'
  echo 'Keeps source files, root .env and Docker images.'
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo 'Usage: bash scripts/stop-project.sh [--help]' >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo 'Missing root .env. Restore it so Compose can identify the configured project.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker is unavailable. Start Docker Desktop and try again.' >&2
  exit 1
fi
CLIENT=(docker-compose --env-file .env)
STAFF=(docker-compose --env-file .env
       -f deployment/admin-analytics/admin-analyst-stack.compose.yml)
# Validate both configurations before removing anything; never print secrets.
"${CLIENT[@]}" config
"${STAFF[@]}" config
echo 'Stopping both project stacks and permanently deleting their saved Docker volumes…'
"${STAFF[@]}" down --volumes --remove-orphans
"${CLIENT[@]}" down --volumes --remove-orphans
echo 'Project stopped. Compose-managed database and Kafka volumes deleted.'
echo 'Restart with: bash scripts/start-project.sh'
