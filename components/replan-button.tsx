"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Manual trigger for automatic replanning (FR8): roll overdue/unscheduled
 *  tasks forward into upcoming capacity. */
export function ReplanButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/replan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json();
      if (res.ok) {
        const conflicts = data.conflicts?.length ? `, ${data.conflicts.length} deadline conflict(s)` : "";
        setNote(data.applied > 0 ? `Replanned ${data.applied} task(s)${conflicts}` : "Nothing to replan");
        router.refresh();
      } else {
        setNote("Replan failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button className="initbtn warn" onClick={run} disabled={busy}>
        {busy ? "Replanning…" : "↻ Replan overdue"}
      </button>
      {note && <span style={{ fontSize: 12, color: "var(--muted)" }}>{note}</span>}
    </span>
  );
}
