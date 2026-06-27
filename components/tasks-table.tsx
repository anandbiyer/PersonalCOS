"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type TaskRow = {
  id: string;
  name: string;
  portfolio: "office" | "personal_dev" | "personal_life";
  status: string;
  owner: string | null;
  dueDate: string | Date | null;
  source: string;
};

const PORTFOLIO_CHIP: Record<TaskRow["portfolio"], { cls: string; label: string }> = {
  office: { cls: "c-office", label: "Office" },
  personal_dev: { cls: "c-dev", label: "Personal Dev" },
  personal_life: { cls: "c-life", label: "Personal Life" },
};

const SOURCE_LABEL: Record<string, string> = {
  text: "⌨ text",
  voice: "🎙 voice",
  image: "📷 image",
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TasksTable({ initial }: { initial: TaskRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(t: TaskRow) {
    const next = t.status === "completed" ? "planned" : "completed";
    setBusy(t.id);
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (initial.length === 0) {
    return (
      <div className="empty">
        No tasks yet — capture one from the bar below.
      </div>
    );
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th></th>
          <th>Task</th>
          <th>Portfolio</th>
          <th>Status</th>
          <th>Owner</th>
          <th>Due</th>
          <th>Via</th>
        </tr>
      </thead>
      <tbody>
        {initial.map((t) => {
          const chip = PORTFOLIO_CHIP[t.portfolio];
          const done = t.status === "completed";
          return (
            <tr key={t.id} className={cn(done && "done")}>
              <td>
                <button
                  className={cn("ck", done && "checked")}
                  aria-label={done ? "Mark not done" : "Mark done"}
                  disabled={busy === t.id}
                  onClick={() => toggle(t)}
                >
                  {done ? "✓" : ""}
                </button>
              </td>
              <td className="tname">{t.name}</td>
              <td>
                <span className={cn("chip", chip.cls)}>{chip.label}</span>
              </td>
              <td>
                <span className={cn("st", `st-${t.status}`)}>{t.status}</span>
              </td>
              <td>{t.owner ?? "—"}</td>
              <td className="mono">{fmtDate(t.dueDate)}</td>
              <td className="via">{SOURCE_LABEL[t.source] ?? t.source}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
