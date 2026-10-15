#!/usr/bin/env bash
# Start the client stack, the staff stack, or both, preserving database volumes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="${1:---all}"
case "$MODE" in
  --all|--client|--staff) ;;
  --help|-h)
    echo 'Usage: bash scripts/start-project.sh [--all|--client|--staff]'
    echo 'Default: --all. Start --client before using --staff by itself.'
    echo 'Configure the single root .env from .env.example before starting.'
    echo 'Existing database schema updates: see docs/admin-analytics/setup.md.'
    exit 0 ;;
  *) echo 'Usage: bash scripts/start-project.sh [--all|--client|--staff]' >&2; exit 1 ;;
esac
if [[ $# -gt 1 ]]; then
  echo 'Choose one option: --all, --client or --staff.' >&2; exit 1
fi
if [[ ! -f .env ]]; then
  echo 'Missing .env. Copy .env.example to .env and fill its credentials and API key.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Docker is unavailable. Start Docker Desktop and try again.' >&2; exit 1
fi
STAFF=(docker compose --env-file .env
       -f deployment/admin-analytics/admin-analyst-stack.compose.yml)
# Validate requested configuration before starting either stack; no secrets printed.
if [[ "$MODE" != --staff ]]; then docker compose config --quiet; fi
if [[ "$MODE" != --client ]]; then "${STAFF[@]}" config --quiet; fi
if [[ "$MODE" != --staff ]]; then docker compose up -d --build; fi
if [[ "$MODE" != --client ]]; then "${STAFF[@]}" up -d --build; fi
if [[ "$MODE" != --staff ]]; then echo 'Client app: http://localhost:8084'; fi
if [[ "$MODE" != --client ]]; then
  echo 'Admin login: http://localhost:8086/admin.html'
  echo 'Analyst login: http://localhost:8086/analyst.html'
  echo 'Superset authoring: http://localhost:8088 (separate configured Superset login).'
fi
echo 'Services may need a moment to become ready. Saved database volumes are preserved.'
