import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { acceptInvitation, declineInvitation } from "@/lib/db/repo/handoff";

const Body = z.object({ action: z.enum(["accept", "decline"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  const result =
    parsed.data.action === "accept"
      ? await acceptInvitation(ownerId, id)
      : await declineInvitation(ownerId, id);
  if (!result) {
    return NextResponse.json({ error: "not found or not yours to act on" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, result });
}
