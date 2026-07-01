import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A } from "../helpers/db";
import { act } from "@/lib/orchestrator/act";
import { matchTemplateBlock, blockDurationMin } from "@/lib/planner/template";
import { listTasks } from "@/lib/db/repo/tasks";

/**
 * FR4 — routine template blocks (Gym / Walk, Study, Office…) are not ledger
 * tasks. Editing/deleting them used to just say "which task"; now they clarify
 * (option 1) and, given a time, actually reschedule via a schedule exception +
 * a timed item (option 2).
 */
const TZ = "America/New_York";

describe("[P8] template-block matching", () => {
  it("resolves keywords to routine blocks", () => {
    expect(matchTemplateBlock("reschedule my gym/walk")?.name).toBe("Gym / Walk");
    expect(matchTemplateBlock("move the study block")?.name).toBe("Study (deep focus)");
    expect(matchTemplateBlock("change office to later")?.name).toBe("Office");
    expect(matchTemplateBlock("call the plumber")).toBeNull();
    expect(blockDurationMin({ name: "Gym / Walk", start: "18:00", end: "20:00", portfolio: "personal_life" })).toBe(120);
  });
});

describe("[P8] routine-block edit/delete", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("reschedules a routine block: exception + timed item (option 2)", async () => {
    await resetDb();
    const r = await act(OWNER_A, "edit", "reschedule my Gym/Walk to 7pm", TZ);
    expect(r.actions.some((a) => a.type === "calendar")).toBe(true);
    expect(r.content).toMatch(/moved gym \/ walk/i);

    // A timed "Gym / Walk" item now exists on the ledger…
    const gym = (await listTasks(OWNER_A)).find((t) => t.name === "Gym / Walk");
    expect(gym?.dueDate).toBeTruthy();
    expect(gym?.effortMin).toBe(120);

    // …and a schedule exception vacates the original slot for that day.
    const ex = await asOwner(
      OWNER_A,
      (sql) => sql`select overridden_block, replacement from schedule_exceptions where overridden_block = 'Gym / Walk'`,
    );
    expect(ex.length).toBe(1);
    expect(String(ex[0].replacement)).toMatch(/moved to/i);
  });

  it("clarifies when a routine block is named without a time (option 1)", async () => {
    await resetDb();
    const r = await act(OWNER_A, "edit", "reschedule my Gym/Walk", TZ);
    expect(r.actions[0].type).toBe("noop");
    expect(r.content).toMatch(/routine block/i);
    expect((await listTasks(OWNER_A)).length).toBe(0);
  });

  it("explains a routine block can't be deleted like a task", async () => {
    await resetDb();
    const r = await act(OWNER_A, "delete", "delete my gym block", TZ);
    expect(r.actions[0].type).toBe("noop");
    expect(r.content).toMatch(/routine block/i);
  });
});
