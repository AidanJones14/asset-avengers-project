#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
python -m venv /tmp/endgame-ci-python-coverage
CI_COVERAGE_PYTHON=/tmp/endgame-ci-python-coverage/bin/python
"$CI_COVERAGE_PYTHON" -m pip install --disable-pip-version-check --quiet coverage==7.17.0
mkdir -p coverage/python
"$CI_COVERAGE_PYTHON" -m coverage erase
"$CI_COVERAGE_PYTHON" -m coverage run -m unittest discover -s scripts/tests -p 'test_ci*.py' -v
"$CI_COVERAGE_PYTHON" -m coverage run --append -m unittest discover -s admin-analytics/pipeline/tests -p 'test_*.py' -v
"$CI_COVERAGE_PYTHON" -m coverage xml -o coverage/python/coverage.xml
