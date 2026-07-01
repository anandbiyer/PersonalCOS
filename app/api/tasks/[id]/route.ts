import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { setTaskStatus, updateTask, deleteTask } from "@/lib/db/repo/tasks";
import { taskStatus } from "@/lib/db/schema";

// Accepts a status change (completion/undo) OR a field edit (edit undo /
// restore) — both go through the audited repo functions.
const Body = z.object({
  status: z.enum(taskStatus.enumValues).optional(),
  name: z.string().min(1).max(300).optional(),
  dueDate: z.string().datetime().nullable().optional(),
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
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const ownerId = await getCurrentOwnerId();
  const { status, name, dueDate } = parsed.data;

  let task;
  if (name !== undefined || dueDate !== undefined) {
    task = await updateTask(ownerId, id, {
      ...(name !== undefined ? { name } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
    });
  }
  if (status !== undefined) {
    task = await setTaskStatus(ownerId, id, status);
  }
  if (!task) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ownerId = await getCurrentOwnerId();
  await deleteTask(ownerId, id);
  return NextResponse.json({ ok: true });
}
