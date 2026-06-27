import { describe, it, expect } from "vitest";
import {
  isQuietHours,
  quietWindowAt,
  shouldSuppressNotification,
} from "@/lib/planner/quiet-hours";

/** Phase 2 — quiet hours (FR6). 2026-06-15 is a Monday. */
const at = (h: number, m = 0) => new Date(2026, 5, 15, h, m);

describe("[P2] quiet hours (FR6)", () => {
  it("Family 20:00–21:00 and Reading 21:15–22:00 are quiet (T-FR6-01)", () => {
    expect(quietWindowAt(at(20, 30))?.name).toBe("Family");
    expect(quietWindowAt(at(21, 20))?.name).toBe("Reading");
  });

  it("the 21:00–21:15 gap and daytime are not quiet (T-FR6-02)", () => {
    expect(isQuietHours(at(21, 5))).toBe(false);
    expect(isQuietHours(at(14, 0))).toBe(false);
  });

  it("suppresses non-critical, lets critical through (T-FR6-03)", () => {
    expect(shouldSuppressNotification(at(20, 30))).toBe(true);
    expect(shouldSuppressNotification(at(20, 30), { critical: true })).toBe(false);
    expect(shouldSuppressNotification(at(14, 0))).toBe(false);
  });
});
