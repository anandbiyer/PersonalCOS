"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { projectDay } from "@/lib/planner/calendar";
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
};

const dotColor = (p?: string) =>
  p === "office" ? "var(--office)" : p === "personal_dev" ? "var(--dev)" : p === "personal_life" ? "var(--life)" : "var(--muted)";

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
  useEffect(() => setNow(new Date()), []);

  const plan: CalItem[] = useMemo(
    () => (now ? projectDay(now, { tasks, events, exceptions }).items.filter((i) => !i.allDay) : []),
    [now, tasks, events, exceptions],
  );

  const greeting = now
    ? `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}${name ? `, ${name}` : ""}`
    : "…";
  const dateLabel = now ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
  const initial = (name || "You").trim().charAt(0).toUpperCase();

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
                      <span className="ptm">{i.start ?? ""}</span>
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
