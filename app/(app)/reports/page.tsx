import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks } from "@/lib/db/repo/tasks";
import { ReportsView } from "@/components/reports-view";

/**
 * Server boundary: fetch the owner's tasks (RLS-scoped) and hand them to the
 * client <ReportsView>, which computes all week/now-based metrics in the
 * device's timezone (FR42).
 */
export default async function ReportsPage() {
  const ownerId = await getCurrentOwnerId();
  const tasks = await listTasks(ownerId);
  return <ReportsView tasks={tasks} />;
}
