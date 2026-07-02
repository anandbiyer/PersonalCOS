import postgres from "postgres";

/**
 * Admin (RLS-bypassing) connection — used ONLY for cross-tenant enumeration in
 * cron jobs, which run without a user session and must process every tenant.
 * Everything else goes through the RLS-scoped app client (lib/db).
 *
 * Uses MIGRATE_DATABASE_URL (superuser) locally; in managed Postgres set a
 * dedicated service role. TODO(Phase 5): replace with a least-privilege role
 * that can read users but nothing tenant-scoped.
 */
const globalForAdmin = globalThis as unknown as {
  __pcosAdmin?: ReturnType<typeof postgres>;
};

function adminClient() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No admin database URL available.");
  globalForAdmin.__pcosAdmin ??= postgres(url, { max: 1, prepare: false });
  return globalForAdmin.__pcosAdmin;
}

/** Close the admin pool (used by test teardown). */
export async function closeAdmin(): Promise<void> {
  if (globalForAdmin.__pcosAdmin) {
    await globalForAdmin.__pcosAdmin.end({ timeout: 5 });
    globalForAdmin.__pcosAdmin = undefined;
  }
}

/** Every tenant id (one per user). Cron iterates these and processes each
 *  under its own RLS context via withOwner. */
export async function listAllOwnerIds(): Promise<string[]> {
  const rows = await adminClient()<{ id: string }[]>`SELECT id FROM users`;
  return rows.map((r) => r.id);
}

export type Theme = "aurora" | "sunrise";

export interface AdminUser {
  id: string;
  displayName: string;
  theme: Theme;
}

/**
 * Clerk -> tenant mapping (FR36, NFR-9). The webhook upserts users here; the
 * session resolver reads this to turn a verified Clerk id into our owner_id.
 * Admin (RLS-bypassing) because it runs before any tenant context is set.
 */
export async function adminUpsertUserFromClerk(input: {
  clerkId: string;
  displayName: string;
  timezone?: string;
  theme?: Theme;
}): Promise<string> {
  const rows = await adminClient()<{ id: string }[]>`
    INSERT INTO users (clerk_id, display_name, timezone, theme)
    VALUES (
      ${input.clerkId},
      ${input.displayName},
      ${input.timezone ?? "Asia/Kolkata"},
      ${input.theme ?? "aurora"}
    )
    ON CONFLICT (clerk_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      updated_at = now()
    RETURNING id`;
  return rows[0].id;
}

export async function adminDeleteUserByClerkId(clerkId: string): Promise<void> {
  await adminClient()`DELETE FROM users WHERE clerk_id = ${clerkId}`;
}

export async function adminGetUserByClerkId(clerkId: string): Promise<AdminUser | null> {
  const rows = await adminClient()<{ id: string; display_name: string; theme: Theme }[]>`
    SELECT id, display_name, theme FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (rows.length === 0) return null;
  return { id: rows[0].id, displayName: rows[0].display_name, theme: rows[0].theme };
}

/** Minimal shared metadata: the two-person household roster (id + name only),
 *  used to pick a hand-off recipient. Nothing tenant-scoped crosses. */
export async function listHouseholdRoster(): Promise<{ id: string; displayName: string }[]> {
  const rows = await adminClient()<{ id: string; display_name: string }[]>`
    SELECT id, display_name FROM users ORDER BY display_name`;
  return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
}

export interface DueReminderRule {
  id: string;
  ownerId: string;
  target: string;
  schedule: string;
  scheduleConfig: Record<string, unknown> | null;
}

/** Reminder rules due to fire (FR38). Cross-tenant enumeration for the
 *  per-minute cron; each is dispatched under its own owner. */
export async function listDueReminderRules(now: Date): Promise<DueReminderRule[]> {
  const rows = await adminClient()<
    { id: string; owner_id: string; target: string; schedule: string; schedule_config: Record<string, unknown> | null }[]
  >`SELECT id, owner_id, target, schedule, schedule_config
    FROM reminder_rules
    WHERE active = true AND next_fire IS NOT NULL AND next_fire <= ${now}`;
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    target: r.target,
    schedule: r.schedule,
    scheduleConfig: r.schedule_config,
  }));
}

export async function markReminderFired(id: string, nextFire: Date | null): Promise<void> {
  await adminClient()`
    UPDATE reminder_rules
    SET next_fire = ${nextFire}, active = ${nextFire !== null}
    WHERE id = ${id}`;
}

/**
 * FR49 roll-forward: when a monthly reminder fires, materialize its NEXT
 * calendar instance as a dated task — copying name/portfolio/effort from the
 * rule's most recent instance so the new pill is classified without re-running
 * AI in cron. Idempotent (skips if an instance for this rule+due already
 * exists). Admin-side: the owner is taken from the existing instance, so the
 * insert stays honestly tenant-scoped even without a user session.
 */
export async function materializeMonthlyNextInstance(ruleId: string, dueDate: Date): Promise<void> {
  const [src] = await adminClient()<
    { owner_id: string; name: string; portfolio: string; effort_min: number | null }[]
  >`SELECT owner_id, name, portfolio, effort_min
      FROM tasks WHERE reminder_rule_id = ${ruleId}
      ORDER BY due_date DESC NULLS LAST LIMIT 1`;
  if (!src) return; // no prior instance to base the next one on
  const [dup] = await adminClient()<{ id: string }[]>`
    SELECT id FROM tasks WHERE reminder_rule_id = ${ruleId} AND due_date = ${dueDate} LIMIT 1`;
  if (dup) return; // already materialized (cron retry) — idempotent
  await adminClient()`
    INSERT INTO tasks (owner_id, name, portfolio, due_date, effort_min, status, source, reminder_rule_id)
    VALUES (${src.owner_id}, ${src.name}, ${src.portfolio}, ${dueDate}, ${src.effort_min}, 'planned', 'text', ${ruleId})`;
}
