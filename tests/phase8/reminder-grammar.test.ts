import { describe, it, expect } from "vitest";
import {
  extractDueDate,
  lastDayOfMonthDue,
  monthlyLastDayNextFire,
  cleanTaskTitle,
  REMINDER_DEFAULT_MINUTES,
} from "@/lib/capture/extract-date";
import { parseReminder } from "@/lib/reminders/parse";
import { computeNextFire } from "@/lib/reminders/schedule";

// FR50 — smart reminder grammar (relative + recurring) + monthly schedule kind.
// Timezone-explicit and machine-independent: fixed UTC `now` + IANA tz → exact
// UTC instant. America/New_York is EDT (UTC-4) in summer, EST (UTC-5) in winter.
const TZ = "America/New_York";
const NOW = new Date("2026-06-27T16:00:00Z"); // noon EDT, Sat Jun 27 2026
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("REMINDER_DEFAULT_MINUTES", () => {
  it("is 20:30 — just before the 21:00 quiet-hours boundary", () => {
    expect(REMINDER_DEFAULT_MINUTES).toBe(20 * 60 + 30);
  });
});

describe("extractDueDate — FR50 relative phrases", () => {
  it("'last day of the month' → last day of the current month (21:00 capture default)", () => {
    // Jun 30 21:00 EDT → 01:00Z Jul 1.
    expect(iso(extractDueDate("Rent due last day of the month", NOW, TZ))).toBe("2026-07-01T01:00:00.000Z");
  });

  it("honours a caller-supplied default time (20:30 reminder default)", () => {
    // Jun 30 20:30 EDT → 00:30Z Jul 1.
    expect(iso(extractDueDate("Rent due last day of the month", NOW, TZ, REMINDER_DEFAULT_MINUTES))).toBe(
      "2026-07-01T00:30:00.000Z",
    );
  });

  it("'end of the month' and 'month-end' are equivalent", () => {
    expect(iso(extractDueDate("File report end of the month", NOW, TZ))).toBe("2026-07-01T01:00:00.000Z");
    expect(iso(extractDueDate("Invoice at month-end", NOW, TZ))).toBe("2026-07-01T01:00:00.000Z");
  });

  it("'last day of the week' → Sunday (calendar week is Monday-anchored)", () => {
    // NOW = Sat Jun 27 → this week's Sunday is Jun 28. 21:00 EDT → 01:00Z Jun 29.
    const d = extractDueDate("wrap up last day of the week", NOW, TZ)!;
    expect(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(d)).toBe("Sunday");
    expect(iso(d)).toBe("2026-06-29T01:00:00.000Z");
  });

  it("'fortnight' → today + 14 days", () => {
    // Jun 27 + 14 = Jul 11, 21:00 EDT → 01:00Z Jul 12.
    expect(iso(extractDueDate("renew the pass in a fortnight", NOW, TZ))).toBe("2026-07-12T01:00:00.000Z");
    expect(iso(extractDueDate("check two weeks from today", NOW, TZ))).toBe("2026-07-12T01:00:00.000Z");
  });
});

describe("lastDayOfMonthDue", () => {
  it("offset 0 = this month's last day; offset 1 = next month's, at 20:30", () => {
    expect(iso(lastDayOfMonthDue(NOW, TZ, 0, "reminder"))).toBe("2026-07-01T00:30:00.000Z"); // Jun 30 20:30 EDT
    expect(iso(lastDayOfMonthDue(NOW, TZ, 1, "reminder"))).toBe("2026-08-01T00:30:00.000Z"); // Jul 31 20:30 EDT
  });

  it("uses an explicit time from the text when present", () => {
    // Jun 30 9am EDT → 13:00Z.
    expect(iso(lastDayOfMonthDue(NOW, TZ, 0, "pay rent 9am"))).toBe("2026-06-30T13:00:00.000Z");
  });
});

describe("parseReminder — FR50", () => {
  it("'last day of every month' → monthly {day:last}, tz in config, first fire this month 20:30", () => {
    const r = parseReminder("Rent payment due on last day of every month. Please set a reminder.", NOW, TZ)!;
    expect(r.recurring).toBe(true);
    expect(r.schedule).toBe("monthly");
    expect(r.scheduleConfig).toEqual({ day: "last", tz: TZ });
    expect(iso(r.nextFire)).toBe("2026-07-01T00:30:00.000Z"); // Jun 30 20:30 EDT
    expect(r.subject).toBe("Rent payment");
  });

  it("rolls the monthly first-fire to next month when this month's has passed", () => {
    // now = Jul 1 02:00Z = Jun 30 22:00 EDT — June's 20:30 instance already fired.
    const now2 = new Date("2026-07-01T02:00:00Z");
    const r = parseReminder("last day of every month pay the rent", now2, TZ)!;
    expect(r.schedule).toBe("monthly");
    expect(iso(r.nextFire)).toBe("2026-08-01T00:30:00.000Z"); // Jul 31 20:30 EDT
  });

  it("'last day of THIS month' (no recurrence) → a one-off at 20:30, not monthly", () => {
    const r = parseReminder("remind me to file taxes on the last day of this month", NOW, TZ)!;
    expect(r.recurring).toBe(false);
    expect(r.schedule).toBe("one_off");
    expect(iso(r.nextFire)).toBe("2026-07-01T00:30:00.000Z"); // Jun 30 20:30 EDT
  });

  it("a one-off relative reminder uses the 20:30 default, not 21:00", () => {
    const r = parseReminder("remind me to call the accountant in a fortnight", NOW, TZ)!;
    expect(r.recurring).toBe(false);
    expect(iso(r.nextFire)).toBe("2026-07-12T00:30:00.000Z"); // Jul 11 20:30 EDT
    expect(r.subject).toBe("Call the accountant");
  });

  it("still returns null when there is no schedulable time/recurrence", () => {
    expect(parseReminder("remind me to review the deck", NOW, TZ)).toBeNull();
  });
});

describe("computeNextFire — monthly", () => {
  it("advances to the last day of the following month, preserving local clock time", () => {
    const june = new Date("2026-07-01T00:30:00.000Z"); // Jun 30 20:30 EDT
    const july = computeNextFire("monthly", { day: "last", tz: TZ }, june)!;
    expect(iso(july)).toBe("2026-08-01T00:30:00.000Z"); // Jul 31 20:30 EDT
    const aug = computeNextFire("monthly", { day: "last", tz: TZ }, july)!;
    expect(iso(aug)).toBe("2026-09-01T00:30:00.000Z"); // Aug 31 20:30 EDT
  });

  it("is leap-aware: January → Feb 29 in a leap year, Feb 28 otherwise", () => {
    const jan28 = new Date("2028-02-01T01:30:00.000Z"); // Jan 31 2028 20:30 EST
    expect(iso(computeNextFire("monthly", { day: "last", tz: TZ }, jan28))).toBe("2028-03-01T01:30:00.000Z"); // Feb 29 2028
    const jan27 = new Date("2027-02-01T01:30:00.000Z"); // Jan 31 2027 20:30 EST
    expect(iso(computeNextFire("monthly", { day: "last", tz: TZ }, jan27))).toBe("2027-03-01T01:30:00.000Z"); // Feb 28 2027
  });

  it("monthlyLastDayNextFire agrees with computeNextFire", () => {
    const june = new Date("2026-07-01T00:30:00.000Z");
    expect(iso(monthlyLastDayNextFire(june, TZ))).toBe("2026-08-01T00:30:00.000Z");
  });
});

describe("cleanTaskTitle — FR50 phrases are stripped", () => {
  it("drops relative/recurring date phrases from the offline title", () => {
    expect(cleanTaskTitle("Rent payment due on last day of every month")).toBe("Rent payment");
    expect(cleanTaskTitle("Submit the form end of the month")).toBe("Submit the form");
    expect(cleanTaskTitle("Renew the pass in a fortnight")).toBe("Renew the pass");
    expect(cleanTaskTitle("Review notes last day of the week")).toBe("Review notes");
  });
});
