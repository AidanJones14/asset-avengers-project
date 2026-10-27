#!/usr/bin/env bash
# Runs inside the disposable auth-test container, sharing the CI DB's network.
set -euo pipefail
npm ci --cache /tmp/npm-cache
MFA_TEST_DATABASE_URL="$(node <<'JS'
const e = process.env;
for (const key of ['CI_TEST_DB_USER', 'CI_TEST_DB_PASSWORD', 'CI_TEST_DB_NAME']) {
  if (!e[key]) throw new Error(`Missing ${key}`);
}
process.stdout.write(`postgresql://${encodeURIComponent(e.CI_TEST_DB_USER)}:${encodeURIComponent(e.CI_TEST_DB_PASSWORD)}@127.0.0.1:5432/${encodeURIComponent(e.CI_TEST_DB_NAME)}`);
JS
)"
export MFA_TEST_DATABASE_URL
# TCP readiness avoids the temporary Unix-socket server used during initialization.
node --input-type=module <<'JS'
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.MFA_TEST_DATABASE_URL });
try {
  for (let attempt = 0; ; attempt++) {
    try { await pool.query('SELECT 1'); break; }
    catch (error) {
      if (attempt === 59) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
} finally { await pool.end(); }
JS
npm run test:ci
node /workspace/scripts/ci-lcov.cjs auth-server
