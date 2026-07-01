import { describe, it, expect } from "vitest";
import { extractDueDate, extractDurationMin } from "@/lib/capture/extract-date";

// Timezone-explicit + machine-independent: we pass an IANA tz and a fixed UTC
// instant, and assert the exact resulting UTC instant. America/New_York is EDT
// (UTC-4) in summer and EST (UTC-5) in December 2026.
const TZ = "America/New_York";
const NOW = new Date("2026-06-27T16:00:00Z"); // noon EDT, Sat Jun 27 2026
const DEC = new Date("2026-12-01T17:00:00Z"); // noon EST, Dec 1 2026

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("extractDueDate (timezone-aware)", () => {
  it("date-only gets the 9pm local default, stored as a UTC instant", () => {
    // 9pm EDT Jul 5 -> 01:00Z Jul 6
    expect(iso(extractDueDate("Pay LIC Insurance Bill by July 5, 2026", NOW, TZ))).toBe("2026-07-06T01:00:00.000Z");
  });

  it("a time range resolves to today at the local start time", () => {
    // 7pm EDT Jun 27 -> 23:00Z
    expect(iso(extractDueDate("Visit Hanuman temple 7-8pm", NOW, TZ))).toBe("2026-06-27T23:00:00.000Z");
  });

  it("'tomorrow' is the next local day at 9pm", () => {
    // 9pm EDT Jun 28 -> 01:00Z Jun 29
    expect(iso(extractDueDate("Renew the gym membership tomorrow", NOW, TZ))).toBe("2026-06-29T01:00:00.000Z");
  });

  it("resolves a weekday to a strictly-future local Friday", () => {
    const d = extractDueDate("Finish the deck by friday", NOW, TZ)!;
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(d);
    expect(wd).toBe("Friday");
    expect(d.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("assumes current year for a bare month/day, rolling to next year if passed", () => {
    expect(iso(extractDueDate("Dentist appointment July 5", NOW, TZ))).toBe("2026-07-06T01:00:00.000Z");
    expect(iso(extractDueDate("File taxes by July 5", DEC, TZ))).toBe("2027-07-06T01:00:00.000Z");
  });

  it("supports 'in N days', ISO, and '5th of august'", () => {
    expect(iso(extractDueDate("Follow up in 3 days", NOW, TZ))).toBe("2026-07-01T01:00:00.000Z");
    // Dec 25 9pm EST -> 02:00Z Dec 26
    expect(iso(extractDueDate("Holiday on 2026-12-25", NOW, TZ))).toBe("2026-12-26T02:00:00.000Z");
    expect(iso(extractDueDate("Submit report by 5th of august", NOW, TZ))).toBe("2026-08-06T01:00:00.000Z");
  });

  it("parses a 24h time as today at that local time", () => {
    expect(iso(extractDueDate("Call vendor at 15:30", NOW, TZ))).toBe("2026-06-27T19:30:00.000Z");
  });

  it("accepts a period separator in the time (5.30pm = 5:30pm, India/UK style)", () => {
    // 5:30pm EDT Jun 27 -> 21:30Z; must NOT fall back to the 9pm default.
    expect(iso(extractDueDate("Drop son at violin class 5.30pm", NOW, TZ))).toBe("2026-06-27T21:30:00.000Z");
    expect(iso(extractDueDate("Drop son at violin class 5:30pm", NOW, TZ))).toBe("2026-06-27T21:30:00.000Z");
  });

  it("interprets the same text differently per timezone", () => {
    // 7pm in Kolkata (UTC+5:30) -> 13:30Z, vs 23:00Z for New York above.
    expect(iso(extractDueDate("Visit Hanuman temple 7-8pm", NOW, "Asia/Kolkata"))).toBe("2026-06-27T13:30:00.000Z");
  });

  it("parses a bare ordinal day-of-month as the next occurrence, 9pm default", () => {
    // NOW = Sat Jun 27 2026 EDT. "the 1st" → next 1st = Jul 1 (this month's is past).
    expect(iso(extractDueDate("pay rent on the 1st", NOW, TZ))).toBe("2026-07-02T01:00:00.000Z");
    // "the 30th" is still upcoming this month → Jun 30.
    expect(iso(extractDueDate("credit card bill by the 30th", NOW, TZ))).toBe("2026-07-01T01:00:00.000Z");
    // Bare number without the ordinal form is NOT a date.
    expect(extractDueDate("Buy 5 items at the store", NOW, TZ)).toBeNull();
  });

  it("returns null when there is no date or time", () => {
    expect(extractDueDate("Review the quarterly numbers", NOW, TZ)).toBeNull();
    expect(extractDueDate("Buy 5 items at the store", NOW, TZ)).toBeNull();
  });
});

describe("extractDurationMin", () => {
  it("derives a duration from an explicit start–end window", () => {
    expect(extractDurationMin("Block 2-2:30pm for a focus sprint")).toBe(30);
    expect(extractDurationMin("Deep work 2pm to 4pm")).toBe(120);
    expect(extractDurationMin("Standup 09:00-09:15")).toBe(15);
  });

  it("parses a stated duration phrase", () => {
    expect(extractDurationMin("Add a 30 min block at 2pm")).toBe(30);
    expect(extractDurationMin("Hold 45-min review")).toBe(45);
    expect(extractDurationMin("Reserve 1.5 hours for the deck")).toBe(90);
    expect(extractDurationMin("Grab a coffee for half an hour")).toBe(30);
    expect(extractDurationMin("Take an hour to plan")).toBe(60);
  });

  it("returns null when no duration is stated and ignores clock times like 2pm", () => {
    expect(extractDurationMin("Call the vendor at 2pm")).toBeNull();
    expect(extractDurationMin("Review the quarterly numbers")).toBeNull();
  });
});
