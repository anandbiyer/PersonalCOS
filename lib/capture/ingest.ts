import { classifyCapture, type Classification } from "@/lib/ai/classify";
import { createTask, indexTask } from "@/lib/db/repo/tasks";
import type { CaptureModality } from "@/lib/ai/types";

export interface IngestResult {
  filed: boolean;
  kind: "actionable" | "conversational";
  classification: Classification;
  task?: Awaited<ReturnType<typeof createTask>>;
}

/**
 * Shared capture path for all modalities (FR1, FR2, FR29): classify, apply the
 * conversation-vs-actionable gate (FR33), file with provenance, and index for
 * vector search (FR13). Voice/image transcribe to text upstream, then call this.
 */
export async function ingestText(
  ownerId: string,
  text: string,
  source: CaptureModality,
): Promise<IngestResult> {
  const classification = await classifyCapture(text);
  if (classification.kind === "conversational") {
    return { filed: false, kind: "conversational", classification };
  }
  const task = await createTask(ownerId, {
    name: classification.title,
    portfolio: classification.portfolio,
    source,
  });
  await indexTask(ownerId, task.id, task.name);
  return { filed: true, kind: "actionable", classification, task };
}
