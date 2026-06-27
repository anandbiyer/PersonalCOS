import { describe, it, expect } from "vitest";
import {
  assertAllowed,
  ROBINHOOD_ALLOWLIST,
  computePortfolioStatus,
} from "@/lib/connectors/robinhood";

/** Phase 6 — Robinhood read-only safety + status mapping (FR34). */
describe("[P6] Robinhood read-only guard", () => {
  it("allows the five approved read tools (T-FR34-01)", () => {
    for (const tool of ROBINHOOD_ALLOWLIST) {
      expect(() => assertAllowed(tool)).not.toThrow();
    }
  });

  it("hard-blocks every trading/mutating tool (T-FR34-02)", () => {
    const denied = [
      "place_equity_order",
      "place_option_order",
      "review_equity_order",
      "review_option_order",
      "cancel_equity_order",
      "cancel_option_order",
      "add_to_watchlist",
      "remove_from_watchlist",
      "create_watchlist",
      "update_watchlist",
      "follow_watchlist",
      "create_scan",
      "run_scan",
    ];
    for (const tool of denied) {
      expect(() => assertAllowed(tool), tool).toThrow();
    }
  });

  it("computes total / day change / allocation / concentration (T-FR34-03)", () => {
    const s = computePortfolioStatus({
      totalValue: 1000,
      breakdown: [
        { label: "Equity", value: 750 },
        { label: "Cash", value: 250 },
      ],
      positions: [
        { symbol: "AAPL", quantity: 5 },
        { symbol: "MSFT", quantity: 2 },
      ],
      quotes: { AAPL: { price: 100, close: 90 }, MSFT: { price: 50, close: 50 } },
    });

    expect(s.dayChange).toBe(50); // 5*(100-90) + 2*0
    expect(s.holdings.find((h) => h.symbol === "AAPL")?.value).toBe(500);
    expect(s.allocation.find((a) => a.label === "Equity")?.pct).toBe(75);
    expect(s.concentration).toEqual({ symbol: "AAPL", pct: 50 });
  });
});
