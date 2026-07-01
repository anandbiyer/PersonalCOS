import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { deleteFact, updateFact } from "@/lib/db/repo/facts";

/**
 * Edit / delete a durable fact (FR48). Explicit user delete is the ONLY way to
 * remove durable knowledge — no timer/cron ever does.
 */
const Body = z.object({ value: z.string().min(1).optional(), active: z.boolean().optional() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid input" }, { status: 400 });
  const ownerId = await getCurrentOwnerId();
  const fact = await updateFact(ownerId, id, parsed.data);
  return NextResponse.json({ fact });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ownerId = await getCurrentOwnerId();
  await deleteFact(ownerId, id);
  return NextResponse.json({ ok: true });
}
