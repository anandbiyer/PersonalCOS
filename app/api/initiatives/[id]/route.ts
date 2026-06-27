import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { advanceStage, setNextAction } from "@/lib/db/repo/initiatives";
import { initiativeStage } from "@/lib/db/schema";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("advance"),
    toStage: z.enum(initiativeStage.enumValues),
    nextAction: z.string().optional(),
    nextReview: z.string().datetime().optional(),
    outcome: z.string().optional(),
  }),
  z.object({
    action: z.literal("next-action"),
    nextAction: z.string().min(1),
    nextReview: z.string().datetime(),
  }),
]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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

  try {
    if (parsed.data.action === "advance") {
      const row = await advanceStage(ownerId, id, parsed.data.toStage, {
        nextAction: parsed.data.nextAction,
        nextReview: parsed.data.nextReview ? new Date(parsed.data.nextReview) : undefined,
        outcome: parsed.data.outcome,
      });
      return NextResponse.json({ initiative: row });
    }
    const row = await setNextAction(
      ownerId,
      id,
      parsed.data.nextAction,
      new Date(parsed.data.nextReview),
    );
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ initiative: row });
  } catch (err) {
    // Anti-ideation gate violations surface as 422.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "update failed" },
      { status: 422 },
    );
  }
}
