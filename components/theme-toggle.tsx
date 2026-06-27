"use client";

import { useEffect, useState } from "react";

type Theme = "aurora" | "sunrise";

/**
 * Dev-only theme toggle (Phase 0). Flips the data-theme attribute so both
 * palettes can be previewed before per-user resolution lands in Phase 5.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("aurora");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "sunrise" || current === "aurora") setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "aurora" ? "sunrise" : "aurora";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  }

  return (
    <button className="themetoggle" onClick={toggle} title="Preview the other user's theme (dev only)">
      {theme === "aurora" ? "◐ Aurora" : "◑ Sunrise"}
    </button>
  );
}
