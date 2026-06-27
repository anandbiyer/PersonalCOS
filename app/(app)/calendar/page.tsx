import Link from "next/link";
import { getCurrentOwnerId } from "@/lib/auth";
import { listTasks } from "@/lib/db/repo/tasks";
import { listEvents } from "@/lib/db/repo/events";
import { listExceptions } from "@/lib/db/repo/exceptions";
import { projectDay, projectWeek } from "@/lib/planner/calendar";
import { addDays, endOfDay, sameDay, startOfDay, startOfWeek } from "@/lib/planner/dates";
import type { CalItem, DayPlan } from "@/lib/planner/types";
import { portfolioClass } from "@/lib/ui";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "day";
  const anchor = sp.date ? new Date(sp.date + "T00:00:00") : new Date();

  const from = view === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const to = view === "week" ? endOfDay(addDays(startOfWeek(anchor), 6)) : endOfDay(anchor);

  const ownerId = await getCurrentOwnerId();
  const tasks = await listTasks(ownerId);
  const events = await listEvents(ownerId, from, to);
  const exceptions = await listExceptions(ownerId, from, to);
  const data = { tasks, events, exceptions };

  const step = view === "week" ? 7 : 1;
  const prev = iso(addDays(anchor, -step));
  const next = iso(addDays(anchor, step));
  const dateLabel =
    view === "week"
      ? `Week of ${startOfWeek(anchor).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <section>
      <div className="vh">
        <span className="eyebrow">System of Action · FR28</span>
        <h2>Calendar</h2>
      </div>

      <div className="calbar">
        <div className="seg">
          <Link href={`/calendar?view=day&date=${iso(anchor)}`} className={view === "day" ? "on" : ""}>
            Day
          </Link>
          <Link href={`/calendar?view=week&date=${iso(anchor)}`} className={view === "week" ? "on" : ""}>
            Week
          </Link>
        </div>
        <Link className="navbtn" href={`/calendar?view=${view}&date=${prev}`} aria-label="Previous">
          ‹
        </Link>
        <Link className="navbtn" href={`/calendar?view=${view}&date=${next}`} aria-label="Next">
          ›
        </Link>
        <Link className="navbtn" href={`/calendar?view=${view}`} aria-label="Today" style={{ width: "auto", padding: "0 12px" }}>
          Today
        </Link>
        <span className="caldate">{dateLabel}</span>
      </div>

      {view === "day" ? <DayView plan={projectDay(anchor, data)} /> : <WeekView days={projectWeek(anchor, data)} />}
    </section>
  );
}

function DayView({ plan }: { plan: DayPlan }) {
  const allDay = plan.items.filter((i) => i.allDay);
  const timed = plan.items.filter((i) => !i.allDay);
  return (
    <>
      {allDay.length > 0 && (
        <div className="cal-allday">
          {allDay.map((i) => (
            <div className={`adband ${i.kind === "task" ? "" : ""}`} key={i.key}>
              {i.kind === "event" ? "📅" : i.kind === "task" ? "✓" : "•"} {i.title}
            </div>
          ))}
        </div>
      )}
      <div className="agenda">
        {timed.length === 0 && allDay.length === 0 ? (
          <div className="cal-row">
            <span className="cal-time" />
            <div className="cal-card p-none">Nothing scheduled.</div>
          </div>
        ) : (
          timed.map((i) => (
            <div className="cal-row" key={i.key}>
              <span className="cal-time">{i.start ?? ""}</span>
              <div className={`cal-card ${portfolioClass(i.portfolio)}`}>
                {i.title}
                <span className="kindtag">{i.kind}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function WeekView({ days }: { days: DayPlan[] }) {
  const today = new Date();
  return (
    <div className="weekgrid">
      {days.map((d) => (
        <div className={`daycol ${sameDay(d.date, today) ? "today" : ""}`} key={d.date.toISOString()}>
          <div className="dch">
            <span className="dn">
              {d.date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
            </span>
            <span className="dd">{d.date.getDate()}</span>
          </div>
          {d.items.map((i: CalItem) => (
            <div className={`wev ${portfolioClass(i.portfolio)}`} key={i.key}>
              {i.start && <span className="wt">{i.start}</span>}
              {i.title}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
