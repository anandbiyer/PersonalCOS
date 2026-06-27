import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import { createTask, listTasks } from "@/lib/db/repo/tasks";

/**
 * REGRESSION GUARD — runs forever, not tied to one phase.
 *
 * Added in Phase 1 when capture became a shared write surface: a task written
 * through the application repo path for one tenant must never be visible to
 * another. This locks the isolation guarantee at the app layer (on top of the
 * raw RLS check in phase0/rls.test.ts).
 */
describe("[REGRESSION] capture path respects tenant isolation", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("a task created for A is invisible to B (R-NFR7-01)", async () => {
    await createTask(OWNER_A, {
      name: "A confidential item",
      portfolio: "office",
    });
    expect(await listTasks(OWNER_B)).toHaveLength(0);
    expect((await listTasks(OWNER_A)).map((t) => t.name)).toContain(
      "A confidential item",
    );
  });
});
