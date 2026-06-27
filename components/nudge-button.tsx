"use client";

import { useState } from "react";

/** Waiting-on nudge (FR23). The send mechanism (push/Telegram) lands in
 *  Phase 4; for now it acknowledges the queued nudge. */
export function NudgeButton({ label }: { label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="nudge"
      onClick={() => setDone(true)}
      title="Reminder dispatch wired in Phase 4"
    >
      {done ? "Queued ✓" : label}
    </button>
  );
}
