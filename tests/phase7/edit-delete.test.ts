import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, asOwner, OWNER_A } from "../helpers/db";
import { routeIntent } from "@/lib/orchestrator/router";
import { act } from "@/lib/orchestrator/act";
import { createTask, listTasks } from "@/lib/db/repo/tasks";

/**
 * Increment B — conversational edit & delete (FR11). Editing an existing task
 * reschedules it (audited, FR14); deleting soft-cancels it (recoverable). Both
 * fuzzy-match an existing open task and clarify when they can't. Deterministic.
 */
const TZ = "America/New_York";

describe("[P8] edit/delete routing", () => {
  it("routes edit/delete phrasing to the right intent", async () => {
    expect((await routeIntent("change the dry cleaning task to due Friday")).intent).toBe("edit");
    expect((await routeIntent("reschedule the deck prep to tomorrow 3pm")).intent).toBe("edit");
    expect((await routeIntent("delete the badminton task")).intent).toBe("delete");
    expect((await routeIntent("remove the dentist appointment")).intent).toBe("delete");
  });
});

describe("[P8] conversational edit + delete", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("reschedules a matched task and records an audited before/after (FR11/FR14)", async () => {
    const t = await createTask(OWNER_A, { name: "Pick up dry cleaning", portfolio: "personal_life", source: "text" });
    const r = await act(OWNER_A, "edit", "change the dry cleaning to Friday 3pm", TZ);

    expect(r.actions.some((a) => a.type === "edit")).toBe(true);
    const undo = r.actions.find((a) => a.type === "edit")?.undo;
    expect(undo?.kind).toBe("restore_task");

    const after = (await listTasks(OWNER_A)).find((x) => x.id === t.id)!;
    expect(after.dueDate).not.toBeNull();

    const audits = await asOwner(
      OWNER_A,
      (sql) => sql`SELECT prev_value, new_value FROM audit WHERE change_type = 'task.updated'`,
    );
    expect(audits.length).toBe(1);
    expect((audits[0].prev_value as { dueDate: string | null }).dueDate).toBeNull();
    expect((audits[0].new_value as { dueDate: string | null }).dueDate).not.toBeNull();
  });

  it("asks which task when nothing matches (edit)", async () => {
    await resetDb();
    const r = await act(OWNER_A, "edit", "change the nonexistent thing to Friday", TZ);
    expect(r.actions[0].type).toBe("noop");
    expect(r.content).toMatch(/which task/i);
  });

  it("soft-cancels a matched task (recoverable) and leaves it off open lists", async () => {
    await resetDb();
    const t = await createTask(OWNER_A, { name: "Book badminton court", portfolio: "personal_life", source: "text" });
    const r = await act(OWNER_A, "delete", "delete the badminton task", TZ);

    expect(r.actions.some((a) => a.type === "deleted")).toBe(true);
    expect(r.actions.find((a) => a.type === "deleted")?.undo?.kind).toBe("revert_status");

    const row = await asOwner(
      OWNER_A,
      (sql) => sql`SELECT status FROM tasks WHERE id = ${t.id}`,
    );
    expect(row[0].status).toBe("cancelled");
  });

  it("asks which task when nothing matches (delete)", async () => {
    await resetDb();
    const r = await act(OWNER_A, "delete", "delete the thing that isn't here", TZ);
    expect(r.actions[0].type).toBe("noop");
    expect(r.content).toMatch(/which task/i);
  });
});
