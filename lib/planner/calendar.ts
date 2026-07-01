import { addDays, hasClockTime, hhmm, parseHHMM, sameDay, startOfWeek, toDate } from "./dates";
import { templateFor } from "./template";
import type { CalItem, DayPlan, PlanData } from "./types";

/** Assumed block length for a timed task/event with no stated duration (FR28),
 *  so the calendar and Today's-plan render a start–end range, not just a start. */
export const DEFAULT_TASK_DURATION_MIN = 30;

/** minutes-of-day → "HH:MM", clamped to the end of the day. */
function minToHHMM(min: number): string {
  const c = Math.min(Math.max(min, 0), 23 * 60 + 59);
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

/**
 * Calendar projection (FR28): weekly template + schedule_exceptions + dated
 * tasks/events, colour-coded by portfolio. The current date is the default
 * context; callers pass the anchor date.
 */
export function projectDay(date: Date, data: PlanData = {}): DayPlan {
  const { tasks = [], events = [], exceptions = [] } = data;
  const todays = exceptions.filter((e) => sameDay(toDate(e.date)!, date));

  // Start from the template, applying block overrides.
  const blocks = templateFor(date).map((b) => {
    const override = todays.find((e) => e.overriddenBlock === b.name);
    return override
      ? { ...b, name: override.replacement || b.name, replaced: true }
      : { ...b, replaced: false };
  });

  const items: CalItem[] = blocks.map((b, i) => ({
    key: `block-${i}`,
    title: b.name,
    start: b.start,
    end: b.end,
    portfolio: b.portfolio,
    kind: b.replaced ? "exception" : "block",
    startMin: parseHHMM(b.start),
  }));

  // Exceptions that ADD an activity (no overridden block).
  todays
    .filter((e) => !e.overriddenBlock && e.replacement)
    .forEach((e, i) =>
      items.push({ key: `exadd-${i}`, title: e.replacement!, kind: "exception", allDay: true }),
    );

  // Dated tasks.
  for (const t of tasks) {
    const due = toDate(t.dueDate);
    if (!due || !sameDay(due, date)) continue;
    const timed = hasClockTime(due);
    const startMin = timed ? due.getHours() * 60 + due.getMinutes() : undefined;
    const dur = t.effortMin ?? DEFAULT_TASK_DURATION_MIN;
    items.push({
      key: `task-${t.id}`,
      title: t.name,
      portfolio: t.portfolio,
      kind: "task",
      allDay: !timed,
      start: timed ? hhmm(due) : undefined,
      end: startMin !== undefined ? minToHHMM(startMin + dur) : undefined,
      startMin,
    });
  }

  // Events.
  for (const e of events) {
    const when = toDate(e.date)!;
    if (!sameDay(when, date)) continue;
    const timed = hasClockTime(when);
    const startMin = timed ? when.getHours() * 60 + when.getMinutes() : undefined;
    items.push({
      key: `event-${e.id}`,
      title: e.type || "Event",
      kind: "event",
      allDay: !timed,
      start: timed ? hhmm(when) : undefined,
      end: startMin !== undefined ? minToHHMM(startMin + DEFAULT_TASK_DURATION_MIN) : undefined,
      startMin,
    });
  }

  items.sort((a, b) => {
    if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
    return (a.startMin ?? 0) - (b.startMin ?? 0);
  });

  return { date, items };
}

export function projectWeek(anchor: Date, data: PlanData = {}): DayPlan[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => projectDay(addDays(start, i), data));
}
