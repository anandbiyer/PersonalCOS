import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { commitPlan } from "@/lib/orchestrator/plan";
import { currentConversation, openConversation } from "@/lib/db/repo/conversations";
import { appendTurn } from "@/lib/db/repo/turns";

/**
 * Commit an agreed plan (FR45): apply the moves to the calendar, set reminders,
 * and post a confirmation turn so the agreement shows in the thread.
 */
const Body = z.object({ planId: z.string().uuid() });

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

  const ownerId = await getCurrentOwnerId();
  const result = await commitPlan(ownerId, parsed.data.planId);
  if (!result) {
    return NextResponse.json({ error: "plan not found or already committed" }, { status: 409 });
  }

  const conv = (await currentConversation(ownerId)) ?? (await openConversation(ownerId));
  await appendTurn(ownerId, {
    conversationId: conv.id,
    role: "cos",
    text: `All set — your calendar's updated and reminders are in for ${result.reminders} item${result.reminders === 1 ? "" : "s"}. I'll keep an eye on it and flag if anything slips.`,
    intent: "calendar",
    actionsJson: [{ type: "calendar", label: `📅 Plan committed · ${result.reminders} reminder${result.reminders === 1 ? "" : "s"} set` }],
  });

  return NextResponse.json({ ok: true, ...result });
}
