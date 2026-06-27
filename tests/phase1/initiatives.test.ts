import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A, OWNER_B } from "../helpers/db";
import { client } from "@/lib/db";
import { createInitiative, listInitiatives } from "@/lib/db/repo/initiatives";
import { createDecision, listDecisions } from "@/lib/db/repo/decisions";

/** Phase 1 — initiative (FR3) + decision (FR12) persistence, RLS-scoped. */
describe("[P1] initiatives & decisions", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("creates an initiative visible only to its owner (T-FR3-01)", async () => {
    const init = await createInitiative(OWNER_A, {
      name: "AWS certification",
      portfolio: "personal_dev",
      stage: "validated",
      outcome: "Pass the exam",
      nextAction: "Draft backward study plan",
    });
    expect(init.stage).toBe("validated");
    expect((await listInitiatives(OWNER_A)).map((i) => i.name)).toContain("AWS certification");
    expect(await listInitiatives(OWNER_B)).toHaveLength(0);
  });

  it("creates a decision linked to an initiative (T-FR12-01)", async () => {
    const [init] = await listInitiatives(OWNER_A);
    const dec = await createDecision(OWNER_A, {
      context: "Which study cadence?",
      alternatives: [{ a: "daily 1h" }, { a: "weekend blocks" }],
      choice: "daily 1h",
      reasoning: "Fits the 4:30 study block",
      initiativeId: init.id,
    });
    expect(dec.initiativeId).toBe(init.id);
    expect((await listDecisions(OWNER_A)).map((d) => d.choice)).toContain("daily 1h");
  });
});
