import { Suspense } from "react";
import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks } from "@/lib/db/repo/tasks";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { isStalled } from "@/lib/initiatives/invariant";
import { listEvents } from "@/lib/db/repo/events";
import { listExceptions } from "@/lib/db/repo/exceptions";
import { addDays, endOfDay, startOfDay } from "@/lib/planner/dates";
import { BriefView } from "@/components/brief-view";

/**
 * Server boundary: fetch the owner's data (RLS-scoped) and hand it to the
 * client <BriefView>, which computes the brief — greeting, AM/PM mode, "due
 * today", date label — in the device's timezone (FR42). Events/exceptions are
 * fetched in a small window around the server day so the device's local "today"
 * can't fall outside the range; the client picks the exact local day.
 */
export default async function BriefPage() {
  const now = new Date();
  const from = startOfDay(addDays(now, -2));
  const to = endOfDay(addDays(now, 2));

  const ownerId = await getCurrentOwnerId();
  const tasks = await listTasks(ownerId);
  const initiatives = await listInitiatives(ownerId);
  const events = await listEvents(ownerId, from, to);
  const exceptions = await listExceptions(ownerId, from, to);
  const stalled = initiatives.filter(isStalled).map((i) => ({ name: i.name }));

  return (
    <Suspense fallback={<div className="briefwrap" />}>
      <BriefView tasks={tasks} events={events} exceptions={exceptions} stalled={stalled} />
    </Suspense>
  );
}
