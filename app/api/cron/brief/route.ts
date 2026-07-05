import { NextRequest } from "next/server";
import { runCron } from "@/lib/cron/run";
import { listTasks, replanOverdue } from "@/lib/db/repo/tasks";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { listEvents } from "@/lib/db/repo/events";
import { listExceptions } from "@/lib/db/repo/exceptions";
import { isStalled } from "@/lib/initiatives/invariant";
import { projectDay } from "@/lib/planner/calendar";
import { categorizeWaiting, dueToday, overdueTasks } from "@/lib/planner/reminders";
import { startOfDay, endOfDay } from "@/lib/planner/dates";
import { composeBrief } from "@/lib/brief/compose";
import { openDaySession } from "@/lib/session/lifecycle";
import { currentConversation } from "@/lib/db/repo/conversations";
import { appendTurn, turnsForConversation } from "@/lib/db/repo/turns";
import { dispatch } from "@/lib/notify";

// cron/brief — 04:25 daily: open the day-session (FR44) + synthesise & push the
// morning brief (FR25).
export async function GET(req: NextRequest) {
  return runCron(req, async (ownerId) => {
    const now = new Date();
    // FR44: proactively open the day-session record (the greeting is rendered
    // client-side in the thread).
    await openDaySession(ownerId);
    // FR55: overdue items are no longer silently rolled forward — they surface
    // in the past-due triage card for the manager to resolve (Done/Reschedule/
    // Drop). We still COMPUTE a proposal (apply:false) for the brief's prose,
    // but never mutate due dates behind the manager's back.
    const replanned = await replanOverdue(ownerId, { apply: false });
    const tasks = await listTasks(ownerId);
    const inits = await listInitiatives(ownerId);
    const events = await listEvents(ownerId, startOfDay(now), endOfDay(now));
    const exceptions = await listExceptions(ownerId, startOfDay(now), endOfDay(now));
    const stalled = inits.filter(isStalled).map((i) => ({ name: i.name }));
    const dayPlan = projectDay(now, { tasks, events, exceptions });
    const brief = composeBrief("am", {
      now,
      dayPlan,
      overdue: overdueTasks(tasks, now),
      dueToday: dueToday(tasks, now),
      waiting: categorizeWaiting(tasks, now),
      stalled,
    });
    const replanNote = replanned.applied > 0 ? ` Replanned ${replanned.applied} item(s).` : "";

    // FR44/§3.4: persist the brief as the day's OPENING turn so the fresh thread
    // has a real, recoverable first message (not only a client-side greeting).
    // Guard on a still-empty session → exactly one opening per day, idempotent on
    // cron retry, and never injected into a conversation already in progress.
    const conv = await currentConversation(ownerId);
    if (conv && (await turnsForConversation(ownerId, conv.id, 1)).length === 0) {
      await appendTurn(ownerId, {
        conversationId: conv.id,
        role: "cos",
        text: `${brief.prose}${replanNote}`,
        intent: "status",
      });
    }

    return dispatch({ ownerId, kind: "brief", message: `${brief.greeting}. ${brief.prose}${replanNote}` });
  });
}
