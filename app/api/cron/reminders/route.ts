import { NextRequest } from "next/server";
import { runCron } from "@/lib/cron/run";
import { listTasks } from "@/lib/db/repo/tasks";
import { categorizeWaiting, dueToday, overdueTasks } from "@/lib/planner/reminders";
import { dispatch } from "@/lib/notify";

// cron/reminders — hourly: due/overdue scan + waiting-on nudges (FR6, FR7, FR23).
export async function GET(req: NextRequest) {
  return runCron(req, async (ownerId) => {
    const now = new Date();
    const tasks = await listTasks(ownerId);
    const overdue = overdueTasks(tasks, now);
    const today = dueToday(tasks, now);
    const waiting = categorizeWaiting(tasks, now);

    // Overdue is critical (passes quiet hours); the digest is not.
    if (overdue.length > 0) {
      await dispatch({
        ownerId,
        kind: "reminder",
        critical: true,
        message: `Overdue (${overdue.length}): ${overdue.slice(0, 3).map((t) => t.name).join("; ")}`,
        at: now,
      });
    }
    const digestParts = [
      today.length ? `${today.length} due today` : "",
      waiting.owedToYou.length ? `${waiting.owedToYou.length} waiting on others` : "",
    ].filter(Boolean);
    let digest = null;
    if (digestParts.length) {
      digest = await dispatch({
        ownerId,
        kind: "reminder",
        message: `Reminders: ${digestParts.join(", ")}.`,
        at: now,
      });
    }
    return { overdue: overdue.length, dueToday: today.length, digest };
  });
}
