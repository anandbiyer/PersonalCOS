import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asOwner, resetDb, closeDb, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import {
  createTask,
  listTasks,
  searchTasks,
  setTaskStatus,
} from "@/lib/db/repo/tasks";

/**
 * Phase 1 — capture -> ledger (FR1, FR11, FR14) with provenance (FR29) and
 * tenant isolation (NFR-7) flowing through the application repo path.
 */
describe("[P1] capture -> ledger", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("creates a task with provenance, visible to its owner (T-FR1-01 / T-FR29-03)", async () => {
    const created = await createTask(OWNER_A, {
      name: "Prep the client deck",
      portfolio: "office",
      source: "voice",
    });
    expect(created.source).toBe("voice");

    const rows = await listTasks(OWNER_A);
    expect(rows.map((r) => r.name)).toContain("Prep the client deck");
  });

  it("writes an audit row for each create (T-FR14-01)", async () => {
    const audits = await asOwner(
      OWNER_A,
      (sql) =>
        sql`SELECT change_type FROM audit WHERE change_type = 'task.created'`,
    );
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("does not leak across tenants (T-NFR7-06)", async () => {
    const bRows = await listTasks(OWNER_B);
    expect(bRows.length).toBe(0);
  });

  it("supports structured search over the ledger (T-FR13-02)", async () => {
    await createTask(OWNER_A, {
      name: "Renew LIC premium",
      portfolio: "personal_life",
    });
    const hits = await searchTasks(OWNER_A, "lic");
    expect(hits.map((h) => h.name)).toContain("Renew LIC premium");
  });

  it("completing a task sets status + completedAt and audits it (T-FR11-02)", async () => {
    const [t] = await listTasks(OWNER_A);
    const updated = await setTaskStatus(OWNER_A, t.id, "completed");
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).not.toBeNull();

    const audits = await asOwner(
      OWNER_A,
      (sql) =>
        sql`SELECT change_type FROM audit WHERE change_type = 'task.status'`,
    );
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });
});
