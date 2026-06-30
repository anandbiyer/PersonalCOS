-- Row-Level Security policies (NFR-7).
-- Applied by lib/db/migrate.ts AFTER table creation. Idempotent.
--
-- Isolation model:
--   * owner-scoped tables  -> visible only where owner_id = app.owner_id
--   * users                -> a user sees only their own row (id = app.owner_id)
--   * invitations          -> the ONLY cross-tenant row: visible to sender OR
--                             recipient (FR37, copy-on-accept)
--
-- current_setting('app.owner_id', true) returns NULL when unset (no session
-- context) -> every policy evaluates false -> zero rows. Fail closed.

-- Helper expression repeated below:
--   nullif(current_setting('app.owner_id', true), '')::uuid

-- ---- owner-scoped tables ----
DO $$
DECLARE
  t text;
  owner_tables text[] := ARRAY[
    'initiatives','tasks','people','decisions','events',
    'schedule_exceptions','audit','embeddings','reminder_rules',
    'connector_tokens',
    'conversations','conversation_turns','conversation_summaries',
    'memory_facts','plans'
  ];
BEGIN
  FOREACH t IN ARRAY owner_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (owner_id = nullif(current_setting(''app.owner_id'', true), '''')::uuid) WITH CHECK (owner_id = nullif(current_setting(''app.owner_id'', true), '''')::uuid)',
      t || '_owner_isolation', t
    );
  END LOOP;
END $$;

-- ---- users: see only your own row ----
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self_isolation ON users;
CREATE POLICY users_self_isolation ON users
  USING (id = nullif(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.owner_id', true), '')::uuid);

-- ---- invitations: the only cross-tenant object (sender OR recipient) ----
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_party_access ON invitations;
CREATE POLICY invitations_party_access ON invitations
  USING (
    sender_id = nullif(current_setting('app.owner_id', true), '')::uuid
    OR recipient_id = nullif(current_setting('app.owner_id', true), '')::uuid
  )
  WITH CHECK (
    -- Sender composes the invitation; recipient may update its status
    -- (accept/decline). Column scope (recipient touches status only) is
    -- enforced in application code; RLS governs row access.
    sender_id = nullif(current_setting('app.owner_id', true), '')::uuid
    OR recipient_id = nullif(current_setting('app.owner_id', true), '')::uuid
  );
