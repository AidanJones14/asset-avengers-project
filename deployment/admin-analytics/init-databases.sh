#!/bin/sh
# Runs only when this stack's PostgreSQL volume is empty. Each component receives
# its own login; Superset's reporting login has SELECT on approved views only.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v api_user="$ADMIN_DB_USERNAME" -v api_password="$ADMIN_DB_PASSWORD" \
  -v etl_user="$ETL_DB_USERNAME" -v etl_password="$ETL_DB_PASSWORD" \
  -v reader_user="$SUPERSET_REPORTING_USER" -v reader_password="$SUPERSET_REPORTING_PASSWORD" \
  -v metadata_user="$SUPERSET_METADATA_USER" -v metadata_password="$SUPERSET_METADATA_PASSWORD" \
  -v metadata_db="$SUPERSET_METADATA_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L IN ROLE analytics_admin', :'api_user', :'api_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname=:'api_user') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L IN ROLE analytics_etl', :'etl_user', :'etl_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname=:'etl_user') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L IN ROLE analytics_analyst', :'reader_user', :'reader_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname=:'reader_user') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'metadata_user', :'metadata_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname=:'metadata_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'metadata_db', :'metadata_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname=:'metadata_db') \gexec
SQL
