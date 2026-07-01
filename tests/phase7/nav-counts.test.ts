import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, admin, OWNER_A, OWNER_B } from "../helpers/db";
import { getNavCounts } from "@/lib/nav/counts";
import { createTask, setTaskStatus } from "@/lib/db/repo/tasks";
import { createInvitation } from "@/lib/db/repo/handoff";

/** Live nav badge counts (open tasks / waiting-on / stalled initiatives /
 *  pending inbox). */
describe("[P8] nav badge counts", () => {
  beforeAll(async () => {
    await resetDb();
    await admin`insert into users (id, display_name) values (${OWNER_A}, 'A'), (${OWNER_B}, 'B') on conflict (id) do nothing`;
  });
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("counts open tasks, waiting-on, and pending inbox", async () => {
    const a = await createTask(OWNER_A, { name: "Open one", portfolio: "office", source: "text" });
    await createTask(OWNER_A, { name: "Open two", portfolio: "office", source: "text" });
    const done = await createTask(OWNER_A, { name: "Finished", portfolio: "office", source: "text" });
    await setTaskStatus(OWNER_A, done.id, "completed");
    await setTaskStatus(OWNER_A, a.id, "waiting"); // still open, and waiting-on

    // A hand-off addressed to A (from B) → one pending inbox item.
    await createInvitation(OWNER_B, { recipientId: OWNER_A, title: "Pick up Aarav" });

    const c = await getNavCounts(OWNER_A);
    expect(c.tasks).toBe(2); // two open (waiting still counts as open), completed excluded
    expect(c.waiting).toBeGreaterThanOrEqual(1);
    expect(c.inbox).toBe(1);
    expect(typeof c.initiatives).toBe("number");
  });

  it("is tenant-scoped — B sees its own (empty) counts", async () => {
    const c = await getNavCounts(OWNER_B);
    expect(c.tasks).toBe(0);
    expect(c.inbox).toBe(0);
  });
});
