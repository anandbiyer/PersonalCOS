import { NextRequest } from "next/server";
import { runCron } from "@/lib/cron/run";
import { listTasks } from "@/lib/db/repo/tasks";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { isStalled } from "@/lib/initiatives/invariant";
import { projectDay } from "@/lib/planner/calendar";
import { categorizeWaiting, dueToday, overdueTasks } from "@/lib/planner/reminders";
import { composeBrief } from "@/lib/brief/compose";
import { dispatch } from "@/lib/notify";

// cron/sweep — 21:45 daily: evening completeness-sweep prompt (§6.3). A
// scheduled ritual, so it isn't quiet-hours-suppressed.
export async function GET(req: NextRequest) {
  return runCron(req, async (ownerId) => {
    const now = new Date();
    const tasks = await listTasks(ownerId);
    const inits = await listInitiatives(ownerId);
    const stalled = inits.filter(isStalled).map((i) => ({ name: i.name }));
    const dayPlan = projectDay(now, { tasks });
    const brief = composeBrief("pm", {
      now,
      dayPlan,
      overdue: overdueTasks(tasks, now),
      dueToday: dueToday(tasks, now),
      waiting: categorizeWaiting(tasks, now),
      stalled,
    });
    return dispatch({ ownerId, kind: "sweep", message: brief.prose });
  });
}
