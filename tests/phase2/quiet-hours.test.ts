import { describe, it, expect } from "vitest";
import {
  isQuietHours,
  shouldSuppressNotification,
  deferPastQuietHours,
} from "@/lib/planner/quiet-hours";

/** Phase 2 — quiet hours (FR6): overnight window 21:00–06:00. 2026-06-15 is a Monday. */
const at = (h: number, m = 0) => new Date(2026, 5, 15, h, m);

describe("[P2] quiet hours (FR6)", () => {
  it("the 21:00–06:00 window (wrapping midnight) is quiet (T-FR6-01)", () => {
    expect(isQuietHours(at(21, 0))).toBe(true);
    expect(isQuietHours(at(23, 30))).toBe(true);
    expect(isQuietHours(at(2, 0))).toBe(true);
    expect(isQuietHours(at(5, 59))).toBe(true);
  });

  it("daytime and the 06:00 boundary are not quiet (T-FR6-02)", () => {
    expect(isQuietHours(at(6, 0))).toBe(false);
    expect(isQuietHours(at(14, 0))).toBe(false);
    expect(isQuietHours(at(20, 59))).toBe(false);
  });

  it("suppresses non-critical, lets critical through (T-FR6-03)", () => {
    expect(shouldSuppressNotification(at(22, 0))).toBe(true);
    expect(shouldSuppressNotification(at(22, 0), { critical: true })).toBe(false);
    expect(shouldSuppressNotification(at(14, 0))).toBe(false);
  });

  it("defers a fire time inside quiet hours to the 06:00 window end (T-FR6-06)", () => {
    // 21:00 today → 06:00 tomorrow (Jun 16).
    const deferred = deferPastQuietHours(at(21, 0));
    expect(deferred.getHours()).toBe(6);
    expect(deferred.getDate()).toBe(16);
    // Early-morning quiet time defers to 06:00 the SAME day.
    const early = deferPastQuietHours(at(3, 0));
    expect(early.getHours()).toBe(6);
    expect(early.getDate()).toBe(15);
    // A daytime time is returned unchanged.
    expect(deferPastQuietHours(at(14, 0)).getTime()).toBe(at(14, 0).getTime());
  });
});
