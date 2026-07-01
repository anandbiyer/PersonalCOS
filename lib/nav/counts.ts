import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks } from "@/lib/db/repo/tasks";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { listInbox } from "@/lib/db/repo/handoff";
import { isOpen, categorizeWaiting } from "@/lib/planner/reminders";

/** Live badge counts for the left nav. Computed per request (cheap reads). */
export interface NavCounts {
  tasks: number; // open ledger items
  waiting: number; // waiting-on (you-owe + owed-to-you)
  initiatives: number; // stalled initiatives
  inbox: number; // pending incoming hand-offs
}

export async function getNavCounts(ownerIdArg?: string): Promise<NavCounts> {
  const ownerId = ownerIdArg ?? (await getCurrentOwnerId());
  const now = new Date();

  const tasks = await listTasks(ownerId);
  const w = categorizeWaiting(tasks, now);
  const initiatives = await listInitiatives(ownerId);
  const inbox = await listInbox(ownerId);

  return {
    tasks: tasks.filter((t) => isOpen(t)).length,
    waiting: w.owedToYou.length + w.youOwe.length,
    initiatives: initiatives.filter((i) => i.stalled).length,
    inbox: inbox.length,
  };
}
