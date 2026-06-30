import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { currentConversation, openConversation } from "@/lib/db/repo/conversations";
import { appendTurn, lastTurns } from "@/lib/db/repo/turns";
import { routeIntent } from "@/lib/orchestrator/router";
import { act } from "@/lib/orchestrator/act";
import { composeReply } from "@/lib/orchestrator/reply";

/**
 * The single conversational entry point (FR43). One message →
 *   assemble context → route intent (Haiku) → act (existing engine) →
 *   reply (Haiku) → persist both turns → { reply, intent, actions, plan? }.
 *
 * Phase 2: context is a lightweight recent-turns window. Phase 3 replaces it
 * with the bounded `lib/memory/context.ts` assembler + write-before-compaction
 * fact extraction.
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

  await appendTurn(ownerId, { conversationId: conv.id, role: "user", text: message });

  // Lightweight context for now (Phase 3 swaps in the bounded assembler).
  const recent = await lastTurns(ownerId, 6);
  const context = recent.map((t) => `${t.role}: ${t.text}`).join("\n");

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

  return NextResponse.json({
    reply,
    intent: route.intent,
    actions: result.actions,
    plan: result.plan ?? null,
    needsConfirm: result.needsConfirm ?? false,
  });
}
