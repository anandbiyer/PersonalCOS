"use client";

import Link from "next/link";
import { projectDay, projectWeek } from "@/lib/planner/calendar";
import { addDays, sameDay, startOfWeek } from "@/lib/planner/dates";
import type { CalItem, DayPlan, PlanTask, PlanEvent, PlanException } from "@/lib/planner/types";
import { portfolioClass } from "@/lib/ui";

/**
 * Calendar rendering runs on the CLIENT (FR42): JavaScript Date/Intl use the
 * device's timezone, so the same stored UTC instants are grouped onto the right
 * local day and shown at the right local time on whatever device is used — no
 * server-side timezone configuration. The pure projection (lib/planner/calendar)
 * is unchanged; only where it runs moved from server to browser.
 */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CalendarView({
  tasks,
  events,
  exceptions,
  view,
  anchorParam,
}: {
  tasks: PlanTask[];
  events: PlanEvent[];
  exceptions: PlanException[];
  view: "day" | "week";
  anchorParam: string | null;
}) {
  // No ?date param → "today" in the device's local timezone.
  const anchor = anchorParam ? new Date(anchorParam + "T00:00:00") : new Date();
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
            <div className="adband" key={i.key}>
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
            <span className="dn">{d.date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}</span>
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
