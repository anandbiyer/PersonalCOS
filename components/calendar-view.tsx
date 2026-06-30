"use client";

import Link from "next/link";
import { projectDay, projectWeek } from "@/lib/planner/calendar";
import { addDays, parseHHMM, sameDay, startOfWeek } from "@/lib/planner/dates";
import type { CalItem, DayPlan, PlanTask, PlanEvent, PlanException } from "@/lib/planner/types";
import { portfolioClass } from "@/lib/ui";

/** Solid portfolio colour for a day-grid event block (theme-aware tokens). */
const evBg = (p?: string) =>
  p === "office" ? "var(--office)" : p === "personal_dev" ? "var(--dev)" : p === "personal_life" ? "var(--life)" : "var(--muted)";
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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

      {view === "day" ? (
        <DayView plan={projectDay(anchor, data)} isToday={sameDay(anchor, new Date())} />
      ) : (
        <WeekView days={projectWeek(anchor, data)} />
      )}
    </section>
  );
}

const HPX = 54; // px per hour in the day grid (matches the mockup)

/** Hour-by-hour day grid: a time gutter + positioned event blocks + a now-line. */
function DayView({ plan, isToday }: { plan: DayPlan; isToday: boolean }) {
  const allDay = plan.items.filter((i) => i.allDay);

  const timed = plan.items
    .filter((i) => !i.allDay && (i.startMin != null || i.start))
    .map((i) => {
      const startMin = i.startMin ?? parseHHMM(i.start as string);
      const dur = i.end ? parseHHMM(i.end) - startMin : i.kind === "task" ? 30 : 60;
      return { item: i, startMin, endMin: startMin + Math.max(20, dur) };
    })
    .sort((a, b) => a.startMin - b.startMin);

  // Bound the grid to the items (fallback 8–18), with a sane minimum span.
  let startH = 8;
  let endH = 18;
  if (timed.length) {
    startH = Math.max(0, Math.floor(Math.min(...timed.map((t) => t.startMin)) / 60));
    endH = Math.min(24, Math.ceil(Math.max(...timed.map((t) => t.endMin)) / 60));
    if (endH - startH < 4) endH = Math.min(24, startH + 4);
  }
  const hours = Array.from({ length: endH - startH + 1 }, (_, k) => startH + k);

  const nowMin = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();
  const showNow = isToday && nowMin >= startH * 60 && nowMin <= endH * 60;

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

      {timed.length === 0 ? (
        <div className="empty">Nothing scheduled today.</div>
      ) : (
        <div className="dayview">
          <div className="daygutter">
            {hours.map((h) => (
              <div className="hr" key={h} style={{ height: HPX }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div className="daygrid" style={{ height: (endH - startH) * HPX }}>
            {hours.map((h) => (
              <div className="hrline" key={h} style={{ top: (h - startH) * HPX }} />
            ))}
            {timed.map(({ item: i, startMin, endMin }) => (
              <div
                className="ev"
                key={i.key}
                style={{
                  top: (startMin / 60 - startH) * HPX + 1,
                  height: Math.max(22, ((endMin - startMin) / 60) * HPX - 3),
                  background: evBg(i.portfolio),
                }}
              >
                <div className="et">{i.title}</div>
                <div className="es">
                  {fmtMin(startMin)}
                  {i.end ? `–${fmtMin(endMin)}` : ""} · {i.kind}
                </div>
              </div>
            ))}
            {showNow && <div className="nowline" style={{ top: (nowMin / 60 - startH) * HPX }} />}
          </div>
        </div>
      )}
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
