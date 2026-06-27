import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks } from "@/lib/db/repo/tasks";
import { categorizeWaiting } from "@/lib/planner/reminders";
import { NudgeButton } from "@/components/nudge-button";

export default async function WaitingPage() {
  const ownerId = await getCurrentOwnerId();
  const tasks = await listTasks(ownerId);
  const now = new Date();
  const { youOwe, owedToYou } = categorizeWaiting(tasks, now);

  return (
    <section>
      <div className="vh">
        <span className="eyebrow">System of Action · FR23</span>
        <h2>Waiting on</h2>
      </div>
      <div className="grid g2">
        <div className="panel">
          <h3>You owe</h3>
          {youOwe.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>Nothing outstanding.</div>
          ) : (
            youOwe.map((w) => (
              <div className="wrow" key={w.task.id}>
                <span className="who">→ {w.task.owner}</span>
                <span className="what">{w.task.name}</span>
              </div>
            ))
          )}
        </div>
        <div className="panel">
          <h3>Owed to you</h3>
          {owedToYou.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>Nothing outstanding.</div>
          ) : (
            owedToYou.map((w) => (
              <div className="wrow" key={w.task.id}>
                <span className="who">{w.task.owner ?? "—"}</span>
                <span className="what">{w.task.name}</span>
                <NudgeButton label={`Nudge · ${w.nudgeDays}d`} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
