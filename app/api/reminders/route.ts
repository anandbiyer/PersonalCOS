import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { createReminderRule, listReminderRules } from "@/lib/db/repo/reminders";
import { reminderSchedule, channel } from "@/lib/db/schema";

export async function GET() {
  const ownerId = await getCurrentOwnerId();
  return NextResponse.json({ rules: await listReminderRules(ownerId) });
}

const Body = z.object({
  target: z.string().min(1).max(500),
  schedule: z.enum(reminderSchedule.enumValues),
  scheduleConfig: z.record(z.unknown()).optional(),
  channel: z.enum(channel.enumValues).optional(),
  nextFire: z.string().datetime(),
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
  const rule = await createReminderRule(ownerId, {
    target: parsed.data.target,
    schedule: parsed.data.schedule,
    scheduleConfig: parsed.data.scheduleConfig,
    channel: parsed.data.channel,
    nextFire: new Date(parsed.data.nextFire),
  });
  return NextResponse.json({ rule });
}
