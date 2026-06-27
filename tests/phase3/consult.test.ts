import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { client } from "@/lib/db";
import { consultReply } from "@/lib/consult/consult";
import { listTasks } from "@/lib/db/repo/tasks";

/** Phase 3 — consult mode never auto-files (FR33, Scenario J). */
describe("[P3] consult mode", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("replies without filing anything to the ledger (T-FR33-02 / T-SCEN-J)", async () => {
    const before = (await listTasks(OWNER_A)).length;
    const r = await consultReply(OWNER_A, [
      { role: "user", content: "Should I prioritise the certification or the pilot this month?" },
    ]);
    expect(r.reply.length).toBeGreaterThan(0);
    expect(r.via).toBe("offline"); // hermetic env
    // The core FR33 guarantee: consult creates nothing.
    expect((await listTasks(OWNER_A)).length).toBe(before);
  });
});
