import Anthropic from "@anthropic-ai/sdk";
import type { Portfolio } from "./types";

/**
 * Anthropic client + portfolio-aware model routing (NFR-2).
 *
 * Phase 0 provides the client factory and the routing seam only; classify /
 * advise / Vision implementations land in Phases 1 and 3. Office reasoning is
 * kept on the trusted first-party API and never sent to third-party servers.
 */

// Latest Claude models (knowledge of the most capable tiers as of this build).
export const MODELS = {
  // High-judgment work: advisory loop, vision parsing.
  reasoning: "claude-opus-4-8",
  // Fast classification / routing.
  fast: "claude-haiku-4-5-20251001",
} as const;

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Model kinds (FR43/46). Two tiers by whether the pass is USER-FACING judgment
 * or invisible background bookkeeping:
 *   • Opus (reasoning): high-judgment + conversational quality — advisory/vision
 *     (`reasoning`), intent routing (`route`), the spoken reply (`route`), and
 *     capture classification (`classify`). These drive the "feels like Claude
 *     chat" experience and the correctness of what gets filed, so they run on
 *     the strongest model — fewer mis-routes, richer replies.
 *   • Haiku (fast): cheap, non-user-visible memory passes — `summarize`,
 *     `extract`, and any generic `fast` call. No quality reason to pay more.
 */
export type ModelKind = "reasoning" | "fast" | "route" | "classify" | "summarize" | "extract";

const OPUS_KINDS = new Set<ModelKind>(["reasoning", "route", "classify"]);

/**
 * Pick a model for a portfolio. Office stays on the trusted first-party API;
 * the seam exists so a local/self-hosted route can be added for office later
 * without touching callers.
 */
export function modelFor(
  portfolio: Portfolio | undefined,
  kind: ModelKind = "fast",
): string {
  return OPUS_KINDS.has(kind) ? MODELS.reasoning : MODELS.fast;
}
