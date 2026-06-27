import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron/auth";
import { listDueReminderRules, markReminderFired } from "@/lib/db/admin";
import { computeNextFire, type ReminderScheduleKind } from "@/lib/reminders/schedule";
import { dispatch } from "@/lib/notify";

// cron/fire-reminders — per-minute: evaluate interval reminder rules and
// dispatch each to its owner's channels only (FR38). Channels are per-tenant.
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const due = await listDueReminderRules(now);
  for (const rule of due) {
    await dispatch({ ownerId: rule.ownerId, kind: "reminder", message: rule.target, at: now });
    const next = computeNextFire(rule.schedule as ReminderScheduleKind, rule.scheduleConfig, now);
    await markReminderFired(rule.id, next);
  }
  return NextResponse.json({ fired: due.length });
}
