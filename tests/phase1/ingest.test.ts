import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, closeDb, OWNER_A } from "../helpers/db";
import { client } from "@/lib/db";
import { ingestText } from "@/lib/capture/ingest";
import { listTasks } from "@/lib/db/repo/tasks";

/** Phase 1 — the shared capture pipeline (FR1, FR29, FR33, NFR-6).
 *  Hermetic: no AI keys -> heuristic classify, no-op embedding. */
describe("[P1] capture ingest pipeline", () => {
  beforeAll(resetDb);
  afterAll(async () => {
    await resetDb();
    await client.end({ timeout: 5 });
    await closeDb();
  });

  it("files actionable input with its modality as provenance (T-FR29-03)", async () => {
    const r = await ingestText(OWNER_A, "Prep the client board deck", "voice");
    expect(r.filed).toBe(true);
    expect(r.task?.source).toBe("voice");
  });

  it("gates conversational input — not filed (T-FR33-01)", async () => {
    const r = await ingestText(OWNER_A, "What do you think I should focus on?", "text");
    expect(r.filed).toBe(false);
    expect(r.kind).toBe("conversational");
  });

  it("never fails when the embeddings provider is absent (T-FR1-02)", async () => {
    const before = (await listTasks(OWNER_A)).length;
    const r = await ingestText(OWNER_A, "Renew passport", "image");
    expect(r.filed).toBe(true);
    expect((await listTasks(OWNER_A)).length).toBe(before + 1);
  });

  it("quick-add round-trip is fast (T-NFR6-01)", async () => {
    const t0 = Date.now();
    await ingestText(OWNER_A, "Buy groceries", "text");
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
