-- Runs once, as superuser `postgres`, against database `pcos` on first init.
-- Sets up pgvector and the non-superuser application role used to prove RLS.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pcos_app') THEN
    CREATE ROLE pcos_app LOGIN PASSWORD 'pcos_local_pw' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO pcos_app;

-- Migrations run as `postgres`; ensure tables/sequences it creates are usable
-- by the app role (DML only — never owner/superuser, so RLS still applies).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pcos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pcos_app;
