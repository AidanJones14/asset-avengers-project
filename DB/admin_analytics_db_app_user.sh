#!/bin/sh
# Legacy single-login setup. Current staff Compose uses
# docker/admin-analytics/init-databases.sh for separate API, ETL and Superset logins.
# Creates the backend's login for admin_analytics (run by the postgres image on
# first start, after the schema). The analytics_admin role it joins can read every
# table and view and can only INSERT into admin_audit_log.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v app_user="$ADMIN_DB_USERNAME" -v app_password="$ADMIN_DB_PASSWORD" <<'EOSQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' IN ROLE analytics_admin;
EOSQL
