import { describe, it, expect } from "vitest";
import { isStalled, canEnterStage, isActiveStage } from "@/lib/initiatives/invariant";

/** Phase 3 — anti-ideation invariant (FR16 / §9.2). */
describe("[P3] anti-ideation invariant", () => {
  it("an active initiative missing next action or review is stalled (T-INV-01)", () => {
    expect(isStalled({ stage: "validated", nextAction: null, nextReview: null })).toBe(true);
    expect(isStalled({ stage: "in_dev", nextAction: "Draft scope", nextReview: null })).toBe(true);
    expect(isStalled({ stage: "piloted", nextAction: null, nextReview: new Date() })).toBe(true);
  });

  it("an active initiative with both fields is not stalled (T-INV-02)", () => {
    expect(isStalled({ stage: "validated", nextAction: "Ship v0", nextReview: new Date() })).toBe(false);
  });

  it("idea and adopted stages are exempt (T-INV-03)", () => {
    expect(isActiveStage("idea")).toBe(false);
    expect(isStalled({ stage: "idea", nextAction: null, nextReview: null })).toBe(false);
    expect(isStalled({ stage: "adopted", nextAction: null, nextReview: null })).toBe(false);
  });

  it("the stage gate blocks entering an active stage without action+review (T-FR16-01)", () => {
    expect(canEnterStage("validated", null, null).ok).toBe(false);
    expect(canEnterStage("validated", "Ship v0", new Date()).ok).toBe(true);
    expect(canEnterStage("idea", null, null).ok).toBe(true); // idea has no gate
  });
});
