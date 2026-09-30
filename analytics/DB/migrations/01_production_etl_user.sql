-- Production Database: Create read-only ETL user
-- Run this on the PRODUCTION PostgreSQL database
-- This user will have SELECT-only permissions to copy data to analytics database

CREATE USER etl_user WITH PASSWORD 'secure_etl_password_change_me';

-- Grant SELECT-only to the etl_user on all tables in public schema
GRANT USAGE ON SCHEMA public TO etl_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO etl_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO etl_user;

-- Grant USAGE on sequences (needed for reading data consistently)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO etl_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO etl_user;

-- Grant access to auth schema as well (for user names)
GRANT USAGE ON SCHEMA auth TO etl_user;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO etl_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT ON TABLES TO etl_user;

-- Prevent user from creating anything
ALTER USER etl_user WITH NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

-- Verify permissions
-- SELECT * FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') AND tableowner != 'etl_user';
