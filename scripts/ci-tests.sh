#!/usr/bin/env bash
# Containerized test tools match the runtime versions without installing them on Jenkins.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
case "${1:-}" in
  clean)
    # Only generated reports; remove stale results even if a later suite never starts.
    for module in backend internal-backend; do
      rm -rf -- "$module/target/surefire-reports" "$module/target/site/jacoco"
    done
    for module in auth-server frontend internal-frontend; do
      rm -rf -- "$module/coverage" "$module/test-results"
    done
    ;;
  auth)
    # These suites explicitly require a disposable PostgreSQL URL. Never use .env's
    # application URL or a published host port. Verify ownership before connecting.
    bash scripts/ci-compose.sh up -d auth-db
    container="$(bash scripts/ci-compose.sh ps -q auth-db)"
    [[ -n "$container" && "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container")" == "$CI_PROJECT_NAME" ]]
    settings="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container")"
    while IFS='=' read -r key value; do
      case "$key" in
        POSTGRES_USER) export CI_TEST_DB_USER="$value" ;;
        POSTGRES_PASSWORD) export CI_TEST_DB_PASSWORD="$value" ;;
        POSTGRES_DB) export CI_TEST_DB_NAME="$value" ;;
      esac
    done <<< "$settings"
    docker run --rm --network "container:$container" -u "$(id -u):$(id -g)" \
      -e HOME=/tmp -e CI=true -e CI_TEST_DB_USER -e CI_TEST_DB_PASSWORD -e CI_TEST_DB_NAME \
      -v "$ROOT:/workspace" -w /workspace/auth-server node:24-bookworm \
      bash /workspace/scripts/ci-auth-tests.sh
    ;;

  java)
    # Show nested artifact/transport errors instead of only the plugin failure summary.
    for module in backend internal-backend; do
      docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
        -v "$ROOT:/workspace" -w "/workspace/$module" maven:3.9-eclipse-temurin-25 \
        mvn -B -e -Dmaven.repo.local=/tmp/maven-repository clean test dependency:copy-dependencies \
        -DoutputDirectory=target/dependency
    done
    ;;
  web)
    for module in frontend internal-frontend; do
      docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI=true \
        -v "$ROOT:/workspace" -w "/workspace/$module" node:24-bookworm \
        bash -euo pipefail -c 'npm ci --cache /tmp/npm-cache; npm run test:ci; node /workspace/scripts/ci-lcov.cjs "$1"' -- "$module"
    done
    ;;
  python)
    docker run --rm -u "$(id -u):$(id -g)" -e PYTHONDONTWRITEBYTECODE=1 \
      -v "$ROOT:/workspace" -w /workspace python:3.12-slim \
      bash -euo pipefail -c 'python -m unittest discover -s scripts/tests -p "test_ci*.py" -v; python -m unittest discover -s admin-analytics/pipeline/tests -p "test_*.py" -v'
    ;;
  *) echo 'Usage: ci-tests.sh clean|java|auth|web|python' >&2; exit 2 ;;
esac
