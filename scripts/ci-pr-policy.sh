#!/usr/bin/env bash
# Evaluate Jenkins multibranch metadata before loading credentials or starting Docker.
# Do not require a feature/ prefix: teammates also use fix/, hotfix/ and other names.
set -euo pipefail
if [[ -z "${CHANGE_ID:-}" || -z "${CHANGE_BRANCH:-}" || -z "${CHANGE_TARGET:-}" ]]; then
  echo 'Skipping: this job must have complete pull-request metadata.' >&2
  exit 1
fi
# This pipeline loads shared credentials. Fork PRs need a separate trusted workflow.
if [[ -n "${CHANGE_FORK:-}" ]]; then
  echo 'Skipping: external fork PRs are not enabled for this credentialed pipeline.' >&2
  exit 1
fi
if [[ "$CHANGE_TARGET" == dev && "$CHANGE_BRANCH" != dev ]] || \
   [[ "$CHANGE_BRANCH" == dev && "$CHANGE_TARGET" == main ]]; then
  printf 'Accepted pull request: %s -> %s\n' "$CHANGE_BRANCH" "$CHANGE_TARGET"
else
  echo 'Skipping: allowed routes are a branch into dev, or dev into main.' >&2
  exit 1
fi
