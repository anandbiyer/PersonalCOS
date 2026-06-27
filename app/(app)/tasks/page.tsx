import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks, searchTasksSemantic } from "@/lib/db/repo/tasks";
import { TasksTable, type TaskRow } from "@/components/tasks-table";
import { SearchBox } from "@/components/search-box";
import { ReplanButton } from "@/components/replan-button";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const ownerId = await getCurrentOwnerId();
  const rows = q ? await searchTasksSemantic(ownerId, q) : await listTasks(ownerId);

  const tasks: TaskRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    portfolio: r.portfolio,
    status: r.status,
    owner: r.owner,
    dueDate: r.dueDate,
    source: r.source,
  }));

  return (
    <section>
      <div className="vh">
        <span className="eyebrow">System of Record</span>
        <h2>Tasks ledger</h2>
        <p>
          Persistent across portfolios. Office items use coded client references.
        </p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <SearchBox initial={q} />
        <ReplanButton />
      </div>
      <TasksTable initial={tasks} />
    </section>
  );
}
