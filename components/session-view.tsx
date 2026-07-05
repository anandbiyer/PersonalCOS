"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projectDay } from "@/lib/planner/calendar";
import { overdueTriageItems, type OverdueTriageItem, type OverdueTaskRow } from "@/lib/planner/overdue";
import type { CalItem, PlanTask, PlanEvent, PlanException } from "@/lib/planner/types";

/**
 * Conversation-first home (FR43/44, BINDING UI §5.4). The session thread:
 * greeting + a Today's-plan card + the running dialogue (with inline action
 * cards + undo) + seed chips. The single composer is the pinned capture bar
 * below (one chat bar). Greeting/plan render in the device timezone (FR42),
 * mount-gated like the brief.
 */
type Turn = {
  id: string;
  role: "cos" | "user";
  text: string;
  actionsJson: unknown[];
};
type PlanMove = { id: string; name: string; toDate: string; fromDate: string | null; reason: string };
type ProposedPlan = { id: string; state: string; items: PlanMove[]; changeLog: string[] };
type ActionCard = {
  type: string;
  label: string;
  undo?: { kind: string; id?: string; prev?: string };
  plan?: ProposedPlan; // for type === "plan"
};

const SEEDS = [
  { label: "A 2 PM call came up", message: "A 2 PM client call just came up" },
  { label: "Finished the inventory", message: "Finished the column inventory" },
  { label: "Ask for advice", message: "Should I raise the staffing concern now or wait?" },
];

const ACT_CLASS: Record<string, string> = {
  task_created: "add",
  done: "done",
  calendar: "cal",
  reminder: "rem",
  edit: "edit",
  deleted: "del",
};

const dotColor = (p?: string) =>
  p === "office" ? "var(--office)" : p === "personal_dev" ? "var(--dev)" : p === "personal_life" ? "var(--life)" : "var(--muted)";

/** "04:30" → "4:30am" (12-hour, device-local strings from projectDay). */
const fmtClock = (hhmm?: string): string => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${ap}`;
};

/** Plan-row time label: a start–end range when the item has a duration
 *  (routine blocks/events), else just the start (a timed task). */
const timeRange = (i: { start?: string; end?: string }): string =>
  i.start ? (i.end ? `${fmtClock(i.start)} to ${fmtClock(i.end)}` : fmtClock(i.start)) : "";

/** Avatar initials from a display name ("Anand Iyer" → "AI"); default "AI". */
const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Actions whose completion changes what's on today's plan → re-show the plan. */
const PLAN_ACTIONS = new Set(["task_created", "calendar", "edit", "deleted", "done"]);

/** Revised-plan card (FR45): the proposed moves, with Agree / Tweak. */
function PlanCard({ plan, onAgree, onTweak, busy }: { plan: ProposedPlan; onAgree: () => void; onTweak: () => void; busy: boolean }) {
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="plancard revised">
      <div className="ph">
        📋 Revised plan
        <span className="tagp">PROPOSED</span>
      </div>
      {plan.items.map((it) => (
        <div className="pitem moved" key={it.id}>
          <span className="ptm">{fmtDay(it.toDate)}</span>
          <span className="ptt">
            {it.name} — {it.reason}
          </span>
        </div>
      ))}
      <div className="planacts">
        <button className="pbtn agree" onClick={onAgree} disabled={busy}>
          Agree &amp; set reminders
        </button>
        <button className="pbtn tweak" onClick={onTweak} disabled={busy}>
          Tweak
        </button>
      </div>
    </div>
  );
}

/** Past-due triage (FR55): one row per overdue item, resolved with Done /
 *  Reschedule / Drop. Reschedule reveals an inline date-time picker; Apply
 *  submits every resolution in one POST (no conversational round-trip). */
type TriageChoice = "" | "done" | "reschedule" | "drop";
function OverdueReviewCard({ items, overflow }: { items: OverdueTriageItem[]; overflow: number }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Record<string, TriageChoice>>({});
  const [when, setWhen] = useState<Record<string, string>>({}); // datetime-local per item
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const wasDue = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  const resolutions = items
    .map((it) => {
      const c = choice[it.id];
      if (!c) return null; // untouched rows are a no-op (left overdue)
      if (c === "reschedule") {
        const w = when[it.id];
        if (!w) return null; // reschedule chosen but no date yet → skip
        return { id: it.id, action: "reschedule" as const, dueDate: new Date(w).toISOString() };
      }
      return { id: it.id, action: c };
    })
    .filter(Boolean) as { id: string; action: "done" | "reschedule" | "drop"; dueDate?: string }[];

  async function apply() {
    if (!resolutions.length) return;
    setBusy(true);
    try {
      await fetch("/api/tasks/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions }),
      });
      setDone(true);
      router.refresh(); // resolved items drop out of the overdue set
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="plancard">
        <div className="ph">✓ Past-due items updated</div>
      </div>
    );
  }

  return (
    <div className="plancard revised">
      <div className="ph">
        ⏳ Past due — let&rsquo;s clear these
        <span className="tagp">{items.length}</span>
      </div>
      {items.map((it) => (
        <div className="pitem" key={it.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span className="ptt">{it.name}</span>
            <span className="ptm" style={{ color: "var(--muted)" }}>was due {wasDue(it.dueDate)}</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
            {(["done", "reschedule", "drop"] as const).map((opt) => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="radio"
                  name={`triage-${it.id}`}
                  checked={choice[it.id] === opt}
                  onChange={() => setChoice((c) => ({ ...c, [it.id]: opt }))}
                />
                {opt === "done" ? "Done" : opt === "reschedule" ? "Reschedule" : "Drop"}
              </label>
            ))}
            {choice[it.id] === "reschedule" && (
              <input
                type="datetime-local"
                value={when[it.id] ?? ""}
                onChange={(e) => setWhen((w) => ({ ...w, [it.id]: e.target.value }))}
                style={{ fontSize: 13 }}
              />
            )}
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div className="pitem">
          <span className="ptt" style={{ color: "var(--muted)" }}>+{overflow} more — review later</span>
        </div>
      )}
      <div className="planacts">
        <button className="pbtn agree" onClick={apply} disabled={busy || resolutions.length === 0}>
          Apply
        </button>
      </div>
    </div>
  );
}

export function SessionView({
  name,
  turns,
  tasks,
  events,
  exceptions,
}: {
  name: string;
  turns: Turn[];
  tasks: PlanTask[];
  events: PlanEvent[];
  exceptions: PlanException[];
}) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => setNow(new Date()), []);

  const plan: CalItem[] = useMemo(
    () => (now ? projectDay(now, { tasks, events, exceptions }).items.filter((i) => !i.allDay) : []),
    [now, tasks, events, exceptions],
  );

  // FR55: actionable past-due items to triage, computed live from the ledger so
  // the card is always current and vanishes once items are resolved.
  const overdue = useMemo(
    () => (now ? overdueTriageItems(tasks as unknown as OverdueTaskRow[], now) : { items: [], overflow: 0 }),
    [now, tasks],
  );

  // Did the latest COS turn change today's plan? If so, we re-show the plan card
  // inline (republish) below the exchange.
  const planAffected = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === "cos") {
        return (turns[i].actionsJson as ActionCard[]).some((a) => PLAN_ACTIONS.has(a.type));
      }
    }
    return false;
  }, [turns]);

  // Auto-scroll to the newest message after a reply (and once the greeting/plan
  // have rendered). Requirement: the window follows the conversation.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, planAffected, now]);

  const greeting = now
    ? `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}${name ? `, ${name}` : ""}`
    : "…";
  const dateLabel = now ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
  const initial = initialsOf(name);

  async function send(message: string) {
    if (sending) return;
    setSending(true);
    try {
      await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function undo(a: ActionCard) {
    if (!a.undo?.id) return;
    if (a.undo.kind === "revert_status") {
      await fetch(`/api/tasks/${a.undo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: a.undo.prev || "planned" }),
      });
    } else if (a.undo.kind === "delete_task") {
      await fetch(`/api/tasks/${a.undo.id}`, { method: "DELETE" });
    } else if (a.undo.kind === "restore_task") {
      // Restore the prior field values after an edit (dueDate / name).
      let body: Record<string, unknown> = {};
      try {
        body = a.undo.prev ? JSON.parse(a.undo.prev) : {};
      } catch {
        body = {};
      }
      await fetch(`/api/tasks/${a.undo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    router.refresh();
  }

  async function agreePlan(planId: string) {
    if (sending) return;
    setSending(true);
    try {
      await fetch("/api/plan/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const tweakPlan = () => send("Hold on — let me adjust the plan first.");

  return (
    <div className="sessionwrap">
      <div className="greet">
        <h2>{greeting}</h2>
        <span className="sub">{dateLabel}</span>
      </div>

      <div className="thread">
        <div className="daydiv">
          <span>Today</span>
        </div>

        {now && (
          <>
            {/* The COS opens the day (FR44): greeting → plan → invitation. */}
            <div className="msg cos">
              <div className="ava">CS</div>
              <div className="bubble">
                {greeting}. Here’s the plan I’ve put together for today — reminders are already set on each item.
              </div>
            </div>
            <div className="msg cos">
              <div className="ava">CS</div>
              <div className="plancard">
                <div className="ph">
                  📋 Today’s plan
                  <span className="tagp" style={{ background: "var(--office)", color: "#fff" }}>TODAY</span>
                </div>
                {plan.length ? (
                  plan.map((i) => (
                    <div className="pitem" key={i.key}>
                      <span className="pdot" style={{ background: dotColor(i.portfolio) }} />
                      <span className="ptm">{timeRange(i)}</span>
                      <span className="ptt">{i.title}</span>
                    </div>
                  ))
                ) : (
                  <div className="pitem">
                    <span className="ptt" style={{ color: "var(--muted)" }}>
                      Nothing scheduled yet — tell me what’s on today.
                    </span>
                  </div>
                )}
              </div>
            </div>
            {overdue.items.length > 0 && (
              <div className="msg cos">
                <div className="ava">CS</div>
                <OverdueReviewCard items={overdue.items} overflow={overdue.overflow} />
              </div>
            )}
            <div className="msg cos">
              <div className="ava">CS</div>
              <div className="bubble">
                What would you like to add, update, or talk through? Just tell me — I’ll handle the filing, scheduling and reminders.
              </div>
            </div>
          </>
        )}

        {turns.map((t) =>
          t.role === "user" ? (
            <div className="msg me" key={t.id}>
              <div className="ava">{initial}</div>
              <div className="bubble">{t.text}</div>
            </div>
          ) : (
            <div className="msg cos" key={t.id}>
              <div className="ava">CS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                {(t.actionsJson as ActionCard[])
                  .filter((a) => a.type === "plan" && a.plan)
                  .map((a, ai) => (
                    <PlanCard
                      key={`plan-${ai}`}
                      plan={a.plan!}
                      busy={sending}
                      onAgree={() => agreePlan(a.plan!.id)}
                      onTweak={tweakPlan}
                    />
                  ))}
                {(t.actionsJson as ActionCard[])
                  .filter((a) => ACT_CLASS[a.type])
                  .map((a, ai) => (
                    <div className={`actcard ${ACT_CLASS[a.type]}`} key={ai}>
                      {a.label}
                      {a.undo?.id && (
                        <span className="undo" onClick={() => undo(a)}>
                          undo
                        </span>
                      )}
                    </div>
                  ))}
                {t.text && <div className="bubble">{t.text}</div>}
              </div>
            </div>
          ),
        )}

        {/* Republish today's plan inline after a plan-changing action (FR44). */}
        {now && planAffected && plan.length > 0 && (
          <div className="msg cos">
            <div className="ava">CS</div>
            <div className="plancard">
              <div className="ph">
                📋 Updated plan
                <span className="tagp" style={{ background: "var(--office)", color: "#fff" }}>TODAY</span>
              </div>
              {plan.map((i) => (
                <div className="pitem" key={`u-${i.key}`}>
                  <span className="pdot" style={{ background: dotColor(i.portfolio) }} />
                  <span className="ptm">{timeRange(i)}</span>
                  <span className="ptt">{i.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sseed">
        {SEEDS.map((s) => (
          <button key={s.label} onClick={() => send(s.message)} disabled={sending}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
