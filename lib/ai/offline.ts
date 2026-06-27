/**
 * Global "no external AI" switch. When AI_OFFLINE=1, all cloud AI is disabled
 * and the app uses deterministic fallbacks (heuristic classification,
 * structured search, no embeddings, no STT/Vision). Used to keep tests
 * hermetic and to allow fully-offline local/CI runs.
 */
export function aiOffline(): boolean {
  return process.env.AI_OFFLINE === "1";
}
