import { describe, it, expect } from "vitest";
import { extractDueDate } from "@/lib/capture/extract-date";
import { hasClockTime, sameDay, startOfDay, addDays } from "@/lib/planner/dates";

// Fixed anchor: Saturday-agnostic; tests assert weekday via getDay(), not a
// hardcoded calendar. 2026-06-27 09:00 local.
const NOW = new Date(2026, 5, 27, 9, 0, 0);

describe("extractDueDate", () => {
  it("parses an explicit month/day/year and applies the 9pm date-only default", () => {
    const d = extractDueDate("Pay LIC Insurance Bill by July 5, 2026", NOW)!;
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(21); // 9pm default deadline (bills/rent/CC)
    expect(d.getMinutes()).toBe(0);
    expect(hasClockTime(d)).toBe(true);
  });

  it("parses a time range as today at the start time", () => {
    const d = extractDueDate("Visit Hanuman temple 7-8pm", NOW)!;
    expect(sameDay(d, NOW)).toBe(true);
    expect(d.getHours()).toBe(19);
    expect(d.getMinutes()).toBe(0);
    expect(hasClockTime(d)).toBe(true); // timed
  });

  it("handles 'tomorrow' as the next day at the 9pm default", () => {
    const d = extractDueDate("Renew the gym membership tomorrow", NOW)!;
    expect(sameDay(d, addDays(startOfDay(NOW), 1))).toBe(true);
    expect(d.getHours()).toBe(21); // date-only → 9pm
  });

  it("resolves a weekday name to a strictly-future occurrence", () => {
    const d = extractDueDate("Finish the deck by friday", NOW)!;
    expect(d.getDay()).toBe(5); // Friday
    expect(d.getTime()).toBeGreaterThan(startOfDay(NOW).getTime());
  });

  it("assumes the current year for a bare month/day in the future", () => {
    const d = extractDueDate("Dentist appointment July 5", NOW)!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(5);
  });

  it("rolls a passed bare month/day to next year", () => {
    const dec = new Date(2026, 11, 1, 9, 0, 0); // Dec 1 2026
    const d = extractDueDate("File taxes by July 5", dec)!;
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(6);
  });

  it("supports 'in N days' and ISO and '5th of august'", () => {
    expect(sameDay(extractDueDate("Follow up in 3 days", NOW)!, addDays(startOfDay(NOW), 3))).toBe(true);
    const iso = extractDueDate("Holiday on 2026-12-25", NOW)!;
    expect(iso.getMonth()).toBe(11);
    expect(iso.getDate()).toBe(25);
    const aug = extractDueDate("Submit report by 5th of august", NOW)!;
    expect(aug.getMonth()).toBe(7);
    expect(aug.getDate()).toBe(5);
  });

  it("parses a 24h time as today at that time", () => {
    const d = extractDueDate("Call vendor at 15:30", NOW)!;
    expect(sameDay(d, NOW)).toBe(true);
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(30);
  });

  it("returns null when there is no date or time", () => {
    expect(extractDueDate("Review the quarterly numbers", NOW)).toBeNull();
    expect(extractDueDate("Buy 5 items at the store", NOW)).toBeNull();
  });
});
