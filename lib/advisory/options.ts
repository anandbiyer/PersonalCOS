import { heuristicClassify } from "@/lib/ai/classify";
import type { Advice } from "./types";

/**
 * Deterministic advisory fallback (FR15) used when no LLM is available. Returns
 * three genuinely different courses of action with trade-offs and a reasoned
 * pick — not tone variants. The LLM path replaces these with situation-specific
 * options; this keeps the advisory loop functional offline and testable.
 */
export function heuristicAdvice(situation: string): Advice {
  const portfolio = heuristicClassify(situation).portfolio;
  return {
    situation,
    portfolio,
    options: [
      {
        title: "Smallest real step now",
        detail: "Define the smallest version that produces a concrete artifact this week and start it.",
        tradeoffs: "Fastest momentum and learning; risks under-scoping the full problem.",
      },
      {
        title: "Plan, then commit",
        detail: "Map the outcome, owners, and dates first; commit once the path is clear.",
        tradeoffs: "Lower execution risk; slower to first outcome and can invite over-planning.",
      },
      {
        title: "Gather input first",
        detail: "Pull one or two key facts or a stakeholder view before deciding.",
        tradeoffs: "De-risks a wrong turn; costs time and can become an excuse to defer.",
      },
    ],
    recommendedIndex: 0,
    reasoning:
      "Default to the smallest real step: it produces an artifact, forces the next decision, " +
      "and keeps the initiative off the stalled list. Escalate to planning only if the first step is genuinely blocked.",
    via: "heuristic",
  };
}
