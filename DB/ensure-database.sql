-- Recover an interrupted Docker first-run initialization without deleting data.
-- Run against maintenance database postgres, outside a transaction. psql variables
-- are quoted as values, then format(%I) safely quotes the database/owner identifiers.
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'owner')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database')
\gexec
