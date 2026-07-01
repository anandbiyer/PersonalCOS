import { describe, it, expect } from "vitest";
import { classifyCapture, heuristicClassify } from "@/lib/ai/classify";

/**
 * Phase 1 — classification (FR2) + conversation-vs-actionable gate (FR33).
 * Hermetic: no ANTHROPIC_API_KEY in test env -> heuristic path.
 */
describe("[P1] capture classification", () => {
  it("routes conversational input to the gate, not the ledger (T-FR33-01)", async () => {
    const c = await classifyCapture("What do you think about switching vendors?");
    expect(c.kind).toBe("conversational");
  });

  it("treats a concrete commitment as actionable (T-FR2-03)", async () => {
    const c = await classifyCapture("Email the board deck to Stakeholder M by Friday");
    expect(c.kind).toBe("actionable");
  });

  it("classifies portfolios by content (T-FR2-01)", () => {
    expect(heuristicClassify("Prep the client presentation deck").portfolio).toBe("office");
    expect(heuristicClassify("Study for the AWS certification exam").portfolio).toBe("personal_dev");
    expect(heuristicClassify("Book flights for the Goa vacation").portfolio).toBe("personal_life");
  });

  it("falls back to personal_life when ambiguous (T-FR2-04)", () => {
    expect(heuristicClassify("Tidy the garage shelf").portfolio).toBe("personal_life");
  });

  it("derives a trimmed title and records provenance via (T-FR1-03)", () => {
    const c = heuristicClassify("   call   the   dentist   ");
    expect(c.title).toBe("Call the dentist");
    expect(c.via).toBe("heuristic");
  });

  it("strips scheduling verbs + time/date noise from the title (T-FR2-05)", () => {
    expect(heuristicClassify("Schedule office call at 530pm today").title).toBe("Office call");
    expect(heuristicClassify("remind me to submit the Client F workbook").title).toBe("Submit the Client F workbook");
    expect(heuristicClassify("book badminton court for Saturday").title).toBe("Badminton court");
    expect(heuristicClassify("pay rent on the 1st").title).toBe("Pay rent");
    expect(heuristicClassify("dentist Thursday 4 PM").title).toBe("Dentist");
    // Nothing to strip → just trimmed + sentence-cased.
    expect(heuristicClassify("call the plumber").title).toBe("Call the plumber");
  });
});
