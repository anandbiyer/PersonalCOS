import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { createInvitation } from "@/lib/db/repo/handoff";
import { dispatch } from "@/lib/notify";

const Body = z.object({
  recipientId: z.string().uuid(),
  title: z.string().min(1).max(300),
  dueDate: z.string().datetime().optional(),
  note: z.string().max(2000).optional(),
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
  const ownerId = await getCurrentOwnerId();
  if (parsed.data.recipientId === ownerId) {
    return NextResponse.json({ error: "recipient must be the other household member" }, { status: 400 });
  }

  const invitation = await createInvitation(ownerId, {
    recipientId: parsed.data.recipientId,
    title: parsed.data.title,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    note: parsed.data.note ?? null,
  });

  // Notify the recipient on THEIR channels only (per-tenant).
  await dispatch({
    ownerId: parsed.data.recipientId,
    kind: "nudge",
    message: `Hand-off from household: ${parsed.data.title}`,
  });

  return NextResponse.json({ invitation });
}
