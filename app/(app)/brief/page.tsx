import Link from "next/link";
import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks } from "@/lib/db/repo/tasks";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { isStalled } from "@/lib/initiatives/invariant";
import { listEvents } from "@/lib/db/repo/events";
import { listExceptions } from "@/lib/db/repo/exceptions";
import { projectDay } from "@/lib/planner/calendar";
import { categorizeWaiting, dueToday, overdueTasks } from "@/lib/planner/reminders";
import { composeBrief, type BriefMode } from "@/lib/brief/compose";
import { narrateBrief } from "@/lib/brief/narrate";
import { endOfDay, hhmm, startOfDay } from "@/lib/planner/dates";

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode: modeParam } = await searchParams;
  const now = new Date();
  const mode: BriefMode =
    modeParam === "pm" || (modeParam !== "am" && now.getHours() >= 17)
      ? "pm"
      : "am";

  const ownerId = await getCurrentOwnerId();
  const tasks = await listTasks(ownerId);
  const initiatives = await listInitiatives(ownerId);
  const events = await listEvents(ownerId, startOfDay(now), endOfDay(now));
  const exceptions = await listExceptions(ownerId, startOfDay(now), endOfDay(now));

  const stalled = initiatives.filter(isStalled).map((i) => ({ name: i.name }));
  const dayPlan = projectDay(now, { tasks, events, exceptions });
  const brief = composeBrief(mode, {
    now,
    dayPlan,
    overdue: overdueTasks(tasks, now),
    dueToday: dueToday(tasks, now),
    waiting: categorizeWaiting(tasks, now),
    stalled,
  });

  const prose = await narrateBrief(brief);
  const tag = `${hhmm(now).replace(":", "")} · ${mode === "am" ? "DAWN BRIEF" : "EVENING SWEEP"}`;

  return (
    <div className="briefwrap">
      <div className="greet">
        <h2>{brief.greeting}</h2>
        <span className="sub">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </div>

      <div className="briefcard">
        <div className="head">
          <span className="tag mono">{tag}</span>
          <div className="sw">
            <Link href="/brief?mode=am" className={mode === "am" ? "on" : ""}>
              Morning
            </Link>
            <Link href="/brief?mode=pm" className={mode === "pm" ? "on" : ""}>
              Evening
            </Link>
          </div>
        </div>
        <p className="prose">{prose}</p>
      </div>

      {brief.focus.length > 0 && (
        <div className="focusrow">
          <span className="lbl">Needs you today</span>
          {brief.focus.map((f, i) => (
            <div className="focusitem" key={i}>
              <span className={`dot ${f.tone ?? ""}`} />
              <div style={{ flex: 1 }}>
                <div className="t1">{f.title}</div>
                <div className="t2">{f.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="glance">
        <Link className="gchip" href="/tasks">
          <span className="gv">{brief.glance.tasksToday}</span>
          <span className="gl">due today</span>
        </Link>
        <Link className="gchip" href="/tasks">
          <span className="gv">{brief.glance.overdue}</span>
          <span className="gl">overdue</span>
        </Link>
        <Link className="gchip" href="/waiting">
          <span className="gv">{brief.glance.waitingOn}</span>
          <span className="gl">waiting on</span>
        </Link>
      </div>

      <div className="talk">
        <Link href="/consult">💬 Want to just talk something through?</Link>
      </div>
    </div>
  );
}
