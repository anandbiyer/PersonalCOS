import { addDays, hasClockTime, hhmm, parseHHMM, sameDay, startOfWeek, toDate } from "./dates";
import { templateFor } from "./template";
import type { CalItem, DayPlan, PlanData } from "./types";

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
    items.push({
      key: `task-${t.id}`,
      title: t.name,
      portfolio: t.portfolio,
      kind: "task",
      allDay: !timed,
      start: timed ? hhmm(due) : undefined,
      startMin: timed ? due.getHours() * 60 + due.getMinutes() : undefined,
    });
  }

  // Events.
  for (const e of events) {
    const when = toDate(e.date)!;
    if (!sameDay(when, date)) continue;
    const timed = hasClockTime(when);
    items.push({
      key: `event-${e.id}`,
      title: e.type || "Event",
      kind: "event",
      allDay: !timed,
      start: timed ? hhmm(when) : undefined,
      startMin: timed ? when.getHours() * 60 + when.getMinutes() : undefined,
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
