import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { client } from "@/lib/db";
import {
  createInitiative,
  advanceStage,
  setNextAction,
  getInitiative,
} from "@/lib/db/repo/initiatives";
import { addDays } from "@/lib/planner/dates";

/** Phase 3 — initiative engine + stage gates (FR16, Scenario G). DB-backed. */
describe("[P3] initiative engine", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("idea stage is created un-stalled (exempt) (T-FR16-02)", async () => {
    const i = await createInitiative(OWNER_A, {
      name: "SpreadX adoption",
      portfolio: "office",
      stage: "idea",
    });
    expect(i.stalled).toBe(false);
  });

  it("blocks entering an active stage without action+review, then allows it (T-SCEN-G)", async () => {
    const i = await createInitiative(OWNER_A, {
      name: "Take tool to pilot",
      portfolio: "office",
      stage: "idea",
    });
    await expect(advanceStage(OWNER_A, i.id, "validated", {})).rejects.toThrow();

    const v = await advanceStage(OWNER_A, i.id, "validated", {
      nextAction: "Pilot with Owner A's team",
      nextReview: addDays(new Date(), 7),
    });
    expect(v.stage).toBe("validated");
    expect(v.stalled).toBe(false);
  });

  it("setNextAction un-stalls an active initiative (T-FR16-03)", async () => {
    // Create directly in an active stage with no action -> stalled.
    const i = await createInitiative(OWNER_A, {
      name: "Stalled one",
      portfolio: "personal_dev",
      stage: "validated",
    });
    expect(i.stalled).toBe(true);

    await setNextAction(OWNER_A, i.id, "Write the outline", addDays(new Date(), 5));
    const after = await getInitiative(OWNER_A, i.id);
    expect(after?.stalled).toBe(false);
  });
});
