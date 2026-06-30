"use client";

import { useEffect, useState } from "react";
import {
  atRiskDeadlines,
  completionRate,
  portfolioHealth,
  scheduleVariance,
} from "@/lib/reports/metrics";
import { predictSlippage } from "@/lib/reports/slippage";
import { detectOverload } from "@/lib/planner/overload";
import { addDays, startOfWeek } from "@/lib/planner/dates";
import { portfolioLabel } from "@/lib/ui";
import type { PlanTask } from "@/lib/planner/types";

const BAR_COLOR: Record<string, string> = {
  office: "var(--office)",
  personal_dev: "var(--dev)",
  personal_life: "var(--life)",
};

/**
 * Reports compute on the CLIENT (FR42): the week window, at-risk/overload/
 * slippage scans, and the overload date label all resolve in the device's
 * timezone. The metrics functions are the same pure functions the server used,
 * just run in the browser; `now` is set after mount so nothing renders against
 * server-UTC first.
 */
export function ReportsView({ tasks }: { tasks: PlanTask[] }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  return (
    <section>
      <div className="vh">
        <span className="eyebrow">System of Action · FR10</span>
        <h2>Reports</h2>
      </div>
      {now ? <ReportsBody tasks={tasks} now={now} /> : <div className="empty" style={{ padding: 20 }}>Loading…</div>}
    </section>
  );
}

function ReportsBody({ tasks, now }: { tasks: PlanTask[]; now: Date }) {
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 6);

  const comp = completionRate(tasks, weekStart, weekEnd);
  const variance = scheduleVariance(tasks);
  const atRisk = atRiskDeadlines(tasks, now);
  const health = portfolioHealth(tasks);
  const slippage = predictSlippage(tasks, now);
  const overload = detectOverload(tasks, now);
  const ratePct = Math.round(comp.rate * 100);

  return (
    <>
      <div className="grid g3" style={{ marginBottom: 18 }}>
        <div className="metric">
          <div className="lab">Completion · this week</div>
          <div className={`val ${ratePct >= 70 ? "ok" : "warn"}`}>{ratePct}%</div>
          <div className="sub">
            {comp.completed} of {comp.planned} planned
          </div>
          <div className="hbar">
            <i style={{ width: `${ratePct}%`, background: "var(--life)" }} />
          </div>
        </div>
        <div className="metric">
          <div className="lab">Schedule variance</div>
          <div className={`val ${variance === null || variance >= 0 ? "ok" : "warn"}`}>
            {variance === null ? "—" : `${variance >= 0 ? "+" : ""}${variance.toFixed(1)}d`}
          </div>
          <div className="sub">avg vs due date (＋ = early)</div>
        </div>
        <div className="metric">
          <div className="lab">At-risk deadlines</div>
          <div className={`val ${atRisk === 0 ? "ok" : "warn"}`}>{atRisk}</div>
          <div className="sub">overdue + high-priority soon</div>
        </div>
      </div>

      <div className="panel">
        <h3>Portfolio health</h3>
        {health.map((h) => (
          <div className="phrow" key={h.portfolio}>
            <div className="pl">
              {portfolioLabel(h.portfolio)}
              <span className="s">
                {h.completed}/{h.total} complete
              </span>
            </div>
            <div className="pb">
              <div className="hbar">
                <i style={{ width: `${h.pct}%`, background: BAR_COLOR[h.portfolio] }} />
              </div>
            </div>
            <div className="pv">{h.pct}%</div>
          </div>
        ))}
      </div>

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="panel">
          <h3>Deadline risk · FR24</h3>
          {slippage.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>No at-risk deadlines.</div>
          ) : (
            slippage.map((s) => (
              <div className="wrow" key={s.task.id}>
                <span className="what">{s.task.name}</span>
                <span className="chip c-over">{s.reason}</span>
              </div>
            ))
          )}
        </div>
        <div className="panel">
          <h3>Overload · FR22</h3>
          {overload.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>Capacity looks fine this week.</div>
          ) : (
            overload.map((o) => (
              <div className="wrow" key={o.date.toISOString()}>
                <span className="who">
                  {o.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                </span>
                <span className="what">
                  {o.totalMin}m planned vs {o.capacityMin}m
                  {o.suggestDrop && <> — consider dropping “{o.suggestDrop.name}”</>}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
