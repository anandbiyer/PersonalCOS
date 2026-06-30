import { eq } from "drizzle-orm";
import { getCurrentOwnerId } from "@/lib/auth";
import { withOwner } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { listTasks } from "@/lib/db/repo/tasks";
import { listEvents } from "@/lib/db/repo/events";
import { listExceptions } from "@/lib/db/repo/exceptions";
import { lastTurns } from "@/lib/db/repo/turns";
import { addDays, endOfDay, startOfDay } from "@/lib/planner/dates";
import { SessionView } from "@/components/session-view";

/**
 * Home = the conversation-first session thread (FR43/44). Server fetches the
 * day's turns + the data the opening plan card needs; the client <SessionView>
 * renders greeting + plan + dialogue in the device timezone (FR42). The daily
 * proactive "Open" turns are posted by cron/brief (Phase 6); the composer is
 * the pinned capture bar.
 */
export default async function HomePage() {
  const ownerId = await getCurrentOwnerId();
  const now = new Date();
  const from = startOfDay(addDays(now, -2));
  const to = endOfDay(addDays(now, 2));

  const tasks = await listTasks(ownerId);
  const events = await listEvents(ownerId, from, to);
  const exceptions = await listExceptions(ownerId, from, to);
  const turns = await lastTurns(ownerId, 50);
  const name = await withOwner(ownerId, async (tx) => {
    const [u] = await tx.select({ n: users.displayName }).from(users).where(eq(users.id, ownerId));
    return u?.n ?? "";
  });

  return (
    <SessionView
      name={name}
      turns={turns.map((t) => ({ id: t.id, role: t.role, text: t.text, actionsJson: t.actionsJson }))}
      tasks={tasks}
      events={events}
      exceptions={exceptions}
    />
  );
}
