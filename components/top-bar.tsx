"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { AuthControls } from "./auth-controls";

/** Top bar: current date/time + context pill (mockup). Clock is client-side so
 *  it reflects the viewer's local time without a hydration mismatch. */
export function TopBar() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
    : "--:--";
  const dateLong = now
    ? now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "Today";

  return (
    <header className="top">
      <div className="clock">
        <div className="t mono">{time}</div>
        <div className="d">
          <b>{dateLong}</b>
          <br />
          Command deck
        </div>
        <span className="ctxpill">◐ COMMAND DECK</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ThemeToggle />
        <AuthControls />
      </div>
    </header>
  );
}
