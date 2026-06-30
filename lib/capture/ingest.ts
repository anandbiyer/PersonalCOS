import { classifyCapture, type Classification } from "@/lib/ai/classify";
import { createTask, indexTask } from "@/lib/db/repo/tasks";
import { extractDueDate } from "@/lib/capture/extract-date";
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
  tz?: string,
): Promise<IngestResult> {
  const classification = await classifyCapture(text);
  if (classification.kind === "conversational") {
    return { filed: false, kind: "conversational", classification };
  }
  // Parse a due date from the original text (FR4/FR40) in the capturing
  // device's timezone (FR42) so dated captures flow onto the calendar at the
  // right local day/time. Deterministic, so it runs the same online and offline.
  const dueDate = extractDueDate(text, new Date(), tz);
  const task = await createTask(ownerId, {
    name: classification.title,
    portfolio: classification.portfolio,
    source,
    dueDate,
  });
  await indexTask(ownerId, task.id, task.name);
  return { filed: true, kind: "actionable", classification, task };
}
