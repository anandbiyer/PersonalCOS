import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { client } from "@/lib/db";
import { createTask, searchTasksSemantic } from "@/lib/db/repo/tasks";
import { embeddingsEnabled } from "@/lib/ai/embeddings";

/** Phase 1 — search (FR13). In the hermetic env embeddings are disabled, so
 *  semantic search falls back to structured substring search. Vector ordering
 *  with a real provider is validated by the live smoke test. */
describe("[P1] ledger search", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("embeddings are disabled in the hermetic test env", () => {
    expect(embeddingsEnabled()).toBe(false);
  });

  it("semantic search falls back to structured when embeddings are off (T-FR13-02)", async () => {
    await createTask(OWNER_A, { name: "Renew LIC premium", portfolio: "personal_life" });
    await createTask(OWNER_A, { name: "Prep client deck", portfolio: "office" });
    const hits = await searchTasksSemantic(OWNER_A, "lic");
    expect(hits.map((h) => h.name)).toContain("Renew LIC premium");
    expect(hits.map((h) => h.name)).not.toContain("Prep client deck");
  });
});
