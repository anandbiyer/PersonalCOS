import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks } from "@/lib/db/repo/tasks";
import { listEvents } from "@/lib/db/repo/events";
import { listExceptions } from "@/lib/db/repo/exceptions";
import { addDays, endOfDay, startOfDay, startOfWeek } from "@/lib/planner/dates";
import { CalendarView } from "@/components/calendar-view";

/**
 * Server boundary: fetch the owner's tasks/events/exceptions (RLS-scoped) and
 * hand them to the client <CalendarView>, which projects and renders in the
 * device's timezone (FR42). The fetch window is widened by a few days around the
 * basis so the device's local "today" can't fall just outside the range.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "day";
  const basis = sp.date ? new Date(sp.date + "T00:00:00") : new Date();

  const lo = view === "week" ? startOfWeek(basis) : basis;
  const hi = view === "week" ? addDays(startOfWeek(basis), 6) : basis;
  const from = startOfDay(addDays(lo, -3));
  const to = endOfDay(addDays(hi, 3));

  const ownerId = await getCurrentOwnerId();
  const tasks = await listTasks(ownerId);
  const events = await listEvents(ownerId, from, to);
  const exceptions = await listExceptions(ownerId, from, to);

  return (
    <CalendarView
      tasks={tasks}
      events={events}
      exceptions={exceptions}
      view={view}
      anchorParam={sp.date ?? null}
    />
  );
}
