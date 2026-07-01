import { withOwner } from "@/lib/db";
import { audit } from "@/lib/db/schema";

/**
 * Per-turn cost accounting (NFR-10 §7.8). The conversational loop's cost is
 * dominated by the context assembled into every turn; `buildContext` already
 * caps that at MEMORY_CONTEXT_TOKEN_CAP. This module closes the loop by
 * *recording* what each turn actually cost per owner and raising an alert when a
 * turn breaches the soft budget — so drift is observable, not silent.
 *
 * Everything here is deterministic (character-based estimate) and works offline,
 * so it never adds an AI call and stays hermetic under AI_OFFLINE=1.
 */

/** Cheap, deterministic token estimate (~4 chars/token). Shared with context. */
export function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/** Soft per-turn budget: context cap + headroom for the message and the reply.
 *  Breaching it is logged + audited, never blocks the reply. */
export const TURN_TOKEN_BUDGET = Number(
  process.env.MEMORY_TURN_TOKEN_BUDGET ??
    Number(process.env.MEMORY_CONTEXT_TOKEN_CAP ?? 3000) + 1500,
);

export interface TurnCost {
  intent: string;
  contextTokens: number;
  messageTokens: number;
  replyTokens: number;
  total: number;
  budget: number;
  exceeded: boolean;
}

export interface LogTurnCostInput {
  intent: string;
  context: string;
  message: string;
  reply: string;
}

/**
 * Record one turn's estimated token cost as an owner-scoped audit row and, when
 * over budget, emit a warning. Best-effort: a logging failure must never break
 * the conversational response, so errors are swallowed after being surfaced.
 */
export async function logTurnCost(
  ownerId: string,
  input: LogTurnCostInput,
): Promise<TurnCost> {
  const contextTokens = estTokens(input.context);
  const messageTokens = estTokens(input.message);
  const replyTokens = estTokens(input.reply);
  const total = contextTokens + messageTokens + replyTokens;
  const exceeded = total > TURN_TOKEN_BUDGET;

  const cost: TurnCost = {
    intent: input.intent,
    contextTokens,
    messageTokens,
    replyTokens,
    total,
    budget: TURN_TOKEN_BUDGET,
    exceeded,
  };

  if (exceeded) {
    // Budget-exceed alert (NFR-10): observable in server logs; the audit row
    // below makes it queryable per owner.
    console.warn(
      `[memory/budget] owner=${ownerId} turn cost ${total} tok exceeds budget ${TURN_TOKEN_BUDGET} (intent=${input.intent})`,
    );
  }

  try {
    await withOwner(ownerId, async (tx) => {
      await tx.insert(audit).values({
        ownerId,
        changeType: "memory.turn_cost",
        newValue: cost as unknown as Record<string, unknown>,
        actionTaken: exceeded ? "budget_exceeded" : "within_budget",
      });
    });
  } catch (err) {
    console.error(`[memory/budget] failed to record turn cost for owner=${ownerId}`, err);
  }

  return cost;
}
