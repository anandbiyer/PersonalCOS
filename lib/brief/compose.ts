import type { Portfolio } from "@/lib/ai/types";
import type { DayPlan, PlanTask } from "@/lib/planner/types";
import type { WaitingSplit } from "@/lib/planner/reminders";

/**
 * Daily briefing as a synthesised artifact (FR25). Deterministic assembly so
 * it works without an LLM; Claude can later narrate the prose when a key is
 * set. Two modes: morning plan vs evening completeness sweep (§6.3 / §11).
 */
export type BriefMode = "am" | "pm";

export interface BriefFocus {
  title: string;
  detail: string;
  portfolio?: Portfolio;
  tone?: "overdue" | "due" | "waiting";
}

export interface Brief {
  mode: BriefMode;
  greeting: string;
  prose: string;
  focus: BriefFocus[];
  glance: { tasksToday: number; overdue: number; waitingOn: number };
}

export interface BriefInput {
  now: Date;
  name?: string;
  dayPlan: DayPlan;
  overdue: PlanTask[];
  dueToday: PlanTask[];
  waiting: WaitingSplit;
  stalled?: { name: string }[];
}

function greetingFor(now: Date, name: string): string {
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${name}`;
}

export function composeBrief(mode: BriefMode, input: BriefInput): Brief {
  const { now, dayPlan, overdue, dueToday, waiting, stalled = [] } = input;
  const name = input.name ?? "Anand";
  const waitingCount = waiting.owedToYou.length + waiting.youOwe.length;

  const focus: BriefFocus[] = [];
  for (const t of overdue.slice(0, 3))
    focus.push({ title: t.name, detail: "Overdue", portfolio: t.portfolio, tone: "overdue" });
  for (const t of dueToday.slice(0, 3))
    focus.push({ title: t.name, detail: "Due today", portfolio: t.portfolio, tone: "due" });
  for (const w of waiting.owedToYou.slice(0, 2))
    focus.push({
      title: w.task.name,
      detail: `Waiting ${w.nudgeDays}d`,
      portfolio: w.task.portfolio,
      tone: "waiting",
    });

  const blocks = dayPlan.items.filter((i) => i.kind === "block").length;

  let prose: string;
  if (mode === "am") {
    const bits = [
      `You have ${blocks} scheduled blocks today.`,
      dueToday.length ? `${dueToday.length} due today.` : "Nothing due today.",
      overdue.length ? `${overdue.length} overdue — clear these first.` : "Nothing overdue.",
      waitingCount ? `${waitingCount} open waiting-on items.` : "",
      stalled.length ? `${stalled.length} stalled initiative(s) need a next action.` : "",
    ].filter(Boolean);
    prose = bits.join(" ");
  } else {
    // Evening completeness sweep (§6.3).
    prose =
      "Evening sweep: what did you commit to today, and what are you waiting on from whom? " +
      (overdue.length ? `${overdue.length} item(s) slipped — replan or close them. ` : "") +
      (dueToday.length ? `${dueToday.length} due item(s) still open.` : "Today's due items are clear.");
  }

  return {
    mode,
    greeting: greetingFor(now, name),
    prose,
    focus,
    glance: {
      tasksToday: dueToday.length,
      overdue: overdue.length,
      waitingOn: waitingCount,
    },
  };
}
