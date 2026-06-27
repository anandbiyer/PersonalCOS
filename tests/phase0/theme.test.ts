import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCurrentTheme } from "@/lib/auth";

/**
 * Phase 0 — per-user theming (FR39).
 */
describe("[P0] theming (FR39)", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const origEnv = process.env.DEV_THEME;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.DEV_THEME;
    else process.env.DEV_THEME = origEnv;
  });

  it("defines both theme token sets (T-FR39-02)", () => {
    expect(css).toContain('[data-theme="aurora"]');
    expect(css).toContain('[data-theme="sunrise"]');
  });

  it("Aurora uses blue/violet/green; Sunrise uses yellow/white/orange (T-FR39-03)", () => {
    // Aurora office blue
    expect(css.toLowerCase()).toContain("#2d7ff9");
    // Sunrise: deep orange + bright yellow
    expect(css.toLowerCase()).toContain("#ea580c");
    expect(css.toLowerCase()).toContain("#ffc400");
  });

  it("resolves theme per user: defaults to aurora, sunrise via override (T-FR39-04)", async () => {
    delete process.env.DEV_THEME;
    expect(await getCurrentTheme()).toBe("aurora");
    process.env.DEV_THEME = "sunrise";
    expect(await getCurrentTheme()).toBe("sunrise");
  });
});
