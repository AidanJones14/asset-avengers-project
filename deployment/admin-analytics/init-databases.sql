-- psql reads container configuration directly; no executable bind mount is required.
-- CREATE-if-missing preserves existing credentials and reporting storage.
\getenv api_user ADMIN_DB_USERNAME
\getenv api_password ADMIN_DB_PASSWORD
\getenv etl_user ETL_DB_USERNAME
\getenv etl_password ETL_DB_PASSWORD
\getenv reader_user SUPERSET_REPORTING_USER
\getenv reader_password SUPERSET_REPORTING_PASSWORD
\getenv metadata_user SUPERSET_METADATA_USER
\getenv metadata_password SUPERSET_METADATA_PASSWORD
\getenv metadata_db SUPERSET_METADATA_DB
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
