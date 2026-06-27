import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { setTaskStatus } from "@/lib/db/repo/tasks";
import { taskStatus } from "@/lib/db/schema";

const Body = z.object({
  status: z.enum(taskStatus.enumValues),
});

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
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  const ownerId = await getCurrentOwnerId();
  const task = await setTaskStatus(ownerId, id, parsed.data.status);
  if (!task) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}
