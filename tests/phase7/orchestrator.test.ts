import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { routeIntent } from "@/lib/orchestrator/router";
import { act } from "@/lib/orchestrator/act";
import { createTask, listTasks } from "@/lib/db/repo/tasks";

/**
 * Phase 7 (conversational upgrade) — orchestrator (FR43).
 * Offline/hermetic: routeIntent uses the deterministic heuristic; act calls the
 * existing engine's offline paths.
 */
describe("[P7] orchestrator routing + actions", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("routes each message to the right intent (offline heuristic)", async () => {
    expect((await routeIntent("Finished the column inventory")).intent).toBe("completion");
    expect((await routeIntent("A 2 PM client call just came up")).intent).toBe("calendar");
    expect((await routeIntent("Should I raise the staffing concern now or wait?")).intent).toBe("question");
    expect((await routeIntent("What's on my plate today?")).intent).toBe("status");
    expect((await routeIntent("Send the deck to Priya")).intent).toBe("handoff");
    expect((await routeIntent("Draft the Q3 board deck")).intent).toBe("task");
  });

  it("completion marks the matching task done", async () => {
    const t = await createTask(OWNER_A, { name: "Client F — column inventory", portfolio: "office", source: "text" });
    const r = await act(OWNER_A, "completion", "finished the column inventory");
    expect(r.actions[0].type).toBe("done");
    expect(r.actions[0].undo?.kind).toBe("revert_status");
    const tasks = await listTasks(OWNER_A);
    expect(tasks.find((x) => x.id === t.id)?.status).toBe("completed");
  });

  it("task intent files a new task with an undo handle", async () => {
    const before = (await listTasks(OWNER_A)).length;
    const r = await act(OWNER_A, "task", "Email the plumber about the kitchen leak");
    expect(["task_created", "calendar"]).toContain(r.actions[0].type);
    expect(r.actions[0].undo?.kind).toBe("delete_task");
    expect((await listTasks(OWNER_A)).length).toBe(before + 1);
  });

  it("status reports open / overdue / waiting counts and writes nothing", async () => {
    const before = (await listTasks(OWNER_A)).length;
    const r = await act(OWNER_A, "status", "what's on my plate");
    expect(r.content).toMatch(/open item/);
    expect((await listTasks(OWNER_A)).length).toBe(before); // read-only
  });

  it("handoff is high-stakes → needs confirmation, files nothing", async () => {
    const before = (await listTasks(OWNER_A)).length;
    const r = await act(OWNER_A, "handoff", "Send the grocery run to Priya");
    expect(r.needsConfirm).toBe(true);
    expect((await listTasks(OWNER_A)).length).toBe(before);
  });
});
