import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import { advise } from "@/lib/advisory/advise";
import { operationalise } from "@/lib/advisory/operationalise";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { listDecisions } from "@/lib/db/repo/decisions";
import { isStalled } from "@/lib/initiatives/invariant";

/** Phase 3 — advisory loop (FR15). Hermetic env -> deterministic options. */
describe("[P3] advisory loop", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("returns 2–3 distinct options with a reasoned pick (T-FR15-01)", async () => {
    const a = await advise("Take SpreadX to a pilot with one team");
    expect(a.options.length).toBeGreaterThanOrEqual(2);
    expect(a.options.length).toBeLessThanOrEqual(3);
    expect(a.recommendedIndex).toBeGreaterThanOrEqual(0);
    expect(a.reasoning.length).toBeGreaterThan(0);
    expect(a.via).toBe("heuristic"); // AI offline in tests
  });

  it("operationalises a choice into a linked, non-stalled initiative (T-FR15-02)", async () => {
    const a = await advise("Earn the cloud certification this quarter");
    const r = await operationalise(OWNER_A, {
      situation: a.situation,
      options: a.options,
      chosenIndex: a.recommendedIndex,
      reasoning: a.reasoning,
      portfolio: a.portfolio,
    });

    expect(r.initiative.stage).toBe("validated");
    expect(isStalled(r.initiative)).toBe(false); // never-empty next action
    expect(r.task.initiativeId).toBe(r.initiative.id);
    expect(r.decision.initiativeId).toBe(r.initiative.id);
    expect(r.decision.taskIds).toContain(r.task.id);

    // Persisted + RLS-scoped.
    expect((await listInitiatives(OWNER_A)).map((i) => i.id)).toContain(r.initiative.id);
    expect((await listDecisions(OWNER_A)).length).toBeGreaterThanOrEqual(1);
    expect(await listInitiatives(OWNER_B)).toHaveLength(0);
  });
});
