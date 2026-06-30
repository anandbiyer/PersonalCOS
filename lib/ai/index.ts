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
 * Routing/memory kinds (FR43/46): route, summarize, extract are cheap
 * orchestration passes and run on Haiku; reasoning stays on Opus.
 */
export type ModelKind = "reasoning" | "fast" | "route" | "summarize" | "extract";

/**
 * Pick a model for a portfolio. Office stays on the trusted first-party API;
 * the seam exists so a local/self-hosted route can be added for office later
 * without touching callers.
 */
export function modelFor(
  portfolio: Portfolio | undefined,
  kind: ModelKind = "fast",
): string {
  // reasoning → Opus; everything else (fast/route/summarize/extract) → Haiku.
  return kind === "reasoning" ? MODELS.reasoning : MODELS.fast;
}
