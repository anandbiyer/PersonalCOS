import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 0 — app shell / IA scaffold and cron placeholders.
 * Covers the structural exit criteria: every mockup view has a route, and the
 * scheduled-job surface (FR25/FR38 wiring) is declared.
 */
const root = process.cwd();
const VIEWS = [
  "brief",
  "tasks",
  "invest",
  "calendar",
  "waiting",
  "reports",
  "consult",
  "initiatives",
  "people",
  "inbox",
];

describe("[P0] scaffold & information architecture", () => {
  it("every mockup view has a route page (T-SHELL-01)", () => {
    for (const v of VIEWS) {
      const p = join(root, "app", "(app)", v, "page.tsx");
      expect(existsSync(p), `${v} route missing`).toBe(true);
    }
  });

  it("root redirects to the daily brief (T-SHELL-02)", () => {
    const page = readFileSync(join(root, "app", "page.tsx"), "utf8");
    expect(page).toMatch(/redirect\(["']\/brief["']\)/);
  });

  it("declares the Vercel cron jobs (T-FR38-01)", () => {
    const vercel = JSON.parse(
      readFileSync(join(root, "vercel.json"), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    const paths = vercel.crons.map((c) => c.path).sort();
    expect(paths).toEqual(
      [
        "/api/cron/brief",
        "/api/cron/fire-reminders",
        "/api/cron/initiative-review",
        "/api/cron/reminders",
        "/api/cron/retention",
        "/api/cron/revalidate",
        "/api/cron/sweep",
      ].sort(),
    );
  });
});
