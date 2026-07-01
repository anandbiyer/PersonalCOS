import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { routeIntent } from "@/lib/orchestrator/router";
import { act } from "@/lib/orchestrator/act";
import { composeReply } from "@/lib/orchestrator/reply";
import { createTask, listTasks } from "@/lib/db/repo/tasks";

/**
 * Path A — the COS confirms-and-stops (no leading questions), and pure
 * closings/acknowledgements route to `chitchat` (a no-op reply), instead of
 * being force-fit to completion/task. Reproduces the screenshot failure where
 * "Nothing needed further. Thanks." became "I couldn't tell which task…".
 */
describe("[P8] chitchat + confirm-and-stop", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await closeDb();
  });

  it("routes closings/acknowledgements to chitchat", async () => {
    for (const m of [
      "Nothing needed further. Thanks.",
      "thanks",
      "thank you!",
      "ok",
      "that's all",
      "nothing else",
      "never mind",
      "all good, cheers",
    ]) {
      expect((await routeIntent(m)).intent, m).toBe("chitchat");
    }
  });

  it("does NOT swallow messages that contain a real request", async () => {
    expect((await routeIntent("ok schedule the demo at 2pm")).intent).not.toBe("chitchat");
    expect((await routeIntent("thanks — now add a task to call the plumber")).intent).not.toBe("chitchat");
    expect((await routeIntent("nothing is ready yet, remind me tomorrow at 9am")).intent).toBe("reminder");
  });

  it("chitchat files nothing and replies without a question", async () => {
    await resetDb();
    const r = await act(OWNER_A, "chitchat", "Nothing needed further. Thanks.");
    expect(r.actions[0].type).toBe("noop");
    expect((await listTasks(OWNER_A)).length).toBe(0);
    expect(r.content).toBeTruthy();
    expect(r.content).not.toContain("?");
    // Crucially, NOT the completion "couldn't tell which task" error.
    expect(r.content).not.toMatch(/which (task|one)/i);
  });

  it("confirm-and-stop: action replies carry no leading question (offline)", async () => {
    await resetDb();
    const cal = await composeReply("dentist tomorrow 4pm", "calendar", { actions: [{ type: "calendar", label: "📅 Added" }] });
    const task = await composeReply("draft the deck", "task", { actions: [{ type: "task_created", label: "✓ Task" }] });
    await createTask(OWNER_A, { name: "x", portfolio: "office", source: "text" });
    expect(cal).not.toContain("?");
    expect(task).not.toContain("?");
  });
});
