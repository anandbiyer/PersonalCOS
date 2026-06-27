import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app, asOwner, resetDb, closeDb, OWNER_A, OWNER_B, OWNER_C } from "../helpers/db";

/**
 * Phase 0 — tenant isolation, the core guardrail.
 * Covers: NFR-7 (DB-enforced isolation via RLS), FR35 (multi-tenancy),
 * FR37 (cross-user hand-off visibility model — invitations).
 *
 * These run as the NON-SUPERUSER app role, so the database itself enforces the
 * boundary — not application code.
 */
describe("[P0] Row-Level Security isolation", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("a tenant sees only its own rows (T-NFR7-03)", async () => {
    await asOwner(OWNER_A, async (sql) => {
      await sql`INSERT INTO tasks (owner_id, name, portfolio, source)
                VALUES (${OWNER_A}, 'A-only task', 'office', 'text')`;
    });
    await asOwner(OWNER_B, async (sql) => {
      await sql`INSERT INTO tasks (owner_id, name, portfolio, source)
                VALUES (${OWNER_B}, 'B-only task', 'personal_life', 'text')`;
    });

    const aRows = await asOwner(OWNER_A, (sql) => sql`SELECT name FROM tasks`);
    const bRows = await asOwner(OWNER_B, (sql) => sql`SELECT name FROM tasks`);

    expect(aRows.map((r) => r.name)).toEqual(["A-only task"]);
    expect(bRows.map((r) => r.name)).toEqual(["B-only task"]);
  });

  it("with no tenant context, zero rows are visible — fail closed (T-NFR7-04)", async () => {
    const rows = await app`SELECT count(*)::int AS c FROM tasks`;
    expect(rows[0].c).toBe(0);
  });

  it("a tenant cannot write a row owned by another (WITH CHECK) (T-NFR7-05)", async () => {
    await expect(
      asOwner(OWNER_A, async (sql) => {
        await sql`INSERT INTO tasks (owner_id, name, portfolio, source)
                  VALUES (${OWNER_B}, 'smuggled', 'office', 'text')`;
      }),
    ).rejects.toThrow();
  });

  it("invitations cross only between sender and recipient (T-FR37-01)", async () => {
    // Two real users (invitations FK -> users).
    await asOwner(OWNER_A, async (sql) => {
      await sql`INSERT INTO users (id, display_name, theme) VALUES (${OWNER_A}, 'A', 'aurora')`;
    });
    await asOwner(OWNER_B, async (sql) => {
      await sql`INSERT INTO users (id, display_name, theme) VALUES (${OWNER_B}, 'B', 'sunrise')`;
    });
    await asOwner(OWNER_C, async (sql) => {
      await sql`INSERT INTO users (id, display_name, theme) VALUES (${OWNER_C}, 'C', 'aurora')`;
    });

    // Sender A hands off to recipient B.
    await asOwner(OWNER_A, async (sql) => {
      await sql`INSERT INTO invitations (sender_id, recipient_id, title)
                VALUES (${OWNER_A}, ${OWNER_B}, 'Pick up Aarav — 5 PM')`;
    });

    const seenByA = await asOwner(OWNER_A, (sql) => sql`SELECT title FROM invitations`);
    const seenByB = await asOwner(OWNER_B, (sql) => sql`SELECT title FROM invitations`);
    const seenByC = await asOwner(OWNER_C, (sql) => sql`SELECT title FROM invitations`);

    expect(seenByA.length).toBe(1); // sender sees it
    expect(seenByB.length).toBe(1); // recipient sees it
    expect(seenByC.length).toBe(0); // unrelated tenant never does
  });
});
