"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectDay } from "@/lib/planner/calendar";
import { categorizeWaiting, dueToday, overdueTasks } from "@/lib/planner/reminders";
import { composeBrief } from "@/lib/brief/compose";
import { hhmm } from "@/lib/planner/dates";
import type { PlanTask, PlanEvent, PlanException } from "@/lib/planner/types";

/**
 * The brief is composed on the CLIENT (FR42) so "today", the greeting, the
 * AM/PM mode, the date label, and the due-today/overdue counts all resolve in
 * the device's timezone — the same pure functions the server used, just run in
 * the browser. `now` is set after mount (like the top bar) so the wrong
 * server-UTC date is never shown and there is no hydration mismatch. LLM
 * narration is fetched from /api/brief/narrate; the deterministic prose shows
 * until (and if) it returns.
 */
export function BriefView({
  tasks,
  events,
  exceptions,
  stalled,
}: {
  tasks: PlanTask[];
  events: PlanEvent[];
  exceptions: PlanException[];
  stalled: { name: string }[];
}) {
  const sp = useSearchParams();
  const modeParam = sp.get("mode");
  const [now, setNow] = useState<Date | null>(null);
  const [prose, setProse] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  const brief = useMemo(() => {
    if (!now) return null;
    const mode =
      modeParam === "pm" || (modeParam !== "am" && now.getHours() >= 17) ? "pm" : "am";
    const dayPlan = projectDay(now, { tasks, events, exceptions });
    return composeBrief(mode, {
      now,
      dayPlan,
      overdue: overdueTasks(tasks, now),
      dueToday: dueToday(tasks, now),
      waiting: categorizeWaiting(tasks, now),
      stalled,
    });
  }, [now, modeParam, tasks, events, exceptions, stalled]);

  // Swap in the LLM narration when available (falls back to deterministic prose).
  useEffect(() => {
    if (!brief) return;
    let cancelled = false;
    setProse(null);
    fetch("/api/brief/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: brief.mode,
        glance: brief.glance,
        focus: brief.focus.map((f) => ({ title: f.title, detail: f.detail })),
        prose: brief.prose,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.prose) setProse(d.prose);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brief?.mode, brief?.glance.tasksToday, brief?.glance.overdue, brief?.glance.waitingOn]);

  if (!now || !brief) {
    return (
      <div className="briefwrap">
        <div className="greet">
          <h2 style={{ opacity: 0.5 }}>Loading your brief…</h2>
        </div>
      </div>
    );
  }

  const mode = brief.mode;
  const tag = `${hhmm(now).replace(":", "")} · ${mode === "am" ? "DAWN BRIEF" : "EVENING SWEEP"}`;
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const shownProse = prose ?? brief.prose;

  return (
    <div className="briefwrap">
      <div className="greet">
        <h2>{brief.greeting}</h2>
        <span className="sub">{dateLabel}</span>
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
        <p className="prose">{shownProse}</p>
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
