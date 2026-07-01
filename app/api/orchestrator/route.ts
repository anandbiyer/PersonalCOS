import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { currentConversation, openConversation } from "@/lib/db/repo/conversations";
import { appendTurn } from "@/lib/db/repo/turns";
import { buildContext } from "@/lib/memory/context";
import { logTurnCost } from "@/lib/memory/budget";
import { extractFacts } from "@/lib/memory/facts";
import { routeIntent } from "@/lib/orchestrator/router";
import { act } from "@/lib/orchestrator/act";
import { composeReply } from "@/lib/orchestrator/reply";

/**
 * The single conversational entry point (FR43). One message →
 *   assemble bounded context (FR46) → route intent (Haiku) → act (existing
 *   engine) → reply (Haiku) → persist both turns + write-before-compaction
 *   fact extraction → { reply, intent, actions, plan? }.
 */
const Body = z.object({
  message: z.string().min(1).max(4000),
  tz: z.string().max(64).optional(),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const { message, tz } = parsed.data;

  const ownerId = await getCurrentOwnerId();
  const conv = (await currentConversation(ownerId)) ?? (await openConversation(ownerId));

  const userTurn = await appendTurn(ownerId, { conversationId: conv.id, role: "user", text: message });

  // Bounded per-turn context (FR46/NFR-10) replaces the naive history replay.
  const context = (await buildContext(ownerId, message)).text;

  const route = await routeIntent(message, context);
  const result = await act(ownerId, route.intent, message, tz);
  const reply = await composeReply(message, route.intent, result);

  await appendTurn(ownerId, {
    conversationId: conv.id,
    role: "cos",
    text: reply,
    intent: route.intent,
    actionsJson: result.actions,
  });

  // Per-owner cost accounting + budget-exceed alert (NFR-10). Best-effort;
  // deterministic and offline-safe (character-based estimate, no AI call).
  await logTurnCost(ownerId, { intent: route.intent, context, message, reply });

  // Write-before-compaction: extract durable facts from the user's message
  // (best-effort; deterministic no-op offline).
  await extractFacts(ownerId, message, userTurn.id);

  return NextResponse.json({
    reply,
    intent: route.intent,
    actions: result.actions,
    plan: result.plan ?? null,
    needsConfirm: result.needsConfirm ?? false,
  });
}
