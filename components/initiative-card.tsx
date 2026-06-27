"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type InitiativeView = {
  id: string;
  name: string;
  portfolio: "office" | "personal_dev" | "personal_life";
  stage: string;
  outcome: string | null;
  nextAction: string | null;
  stalled: boolean;
};

const STAGES = ["idea", "validated", "in_dev", "piloted", "adopted"];
const CHIP: Record<string, string> = {
  office: "c-office",
  personal_dev: "c-dev",
  personal_life: "c-life",
};

export function InitiativeCard({ i }: { i: InitiativeView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState(i.nextAction ?? "");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  async function saveNext() {
    if (!action.trim()) return;
    setBusy(true);
    const nextReview = new Date(Date.now() + days * 86_400_000).toISOString();
    const res = await fetch(`/api/initiatives/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "next-action", nextAction: action.trim(), nextReview }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Update failed");
    }
  }

  async function advance() {
    const to = STAGES[Math.min(STAGES.indexOf(i.stage) + 1, STAGES.length - 1)];
    setBusy(true);
    const res = await fetch(`/api/initiatives/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance", toStage: to }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Add a next action + review before entering an active stage.");
    }
  }

  return (
    <div className={cn("initc", i.stalled && "stalled")}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span className={cn("chip", CHIP[i.portfolio])}>
          {i.portfolio === "office" ? "Office" : i.portfolio === "personal_dev" ? "Dev" : "Life"}
        </span>
        {i.stalled && <span className="stalled-badge" style={{ marginLeft: "auto" }}>STALLED</span>}
      </div>
      <div className="nm">{i.name}</div>
      {i.outcome && <div className="out">{i.outcome}</div>}

      <div className={cn("nextbox", !i.nextAction && "warn")}>
        <span className="lbl">Next action</span>
        <span className="a">{i.nextAction ?? "— none — add one to unstall"}</span>
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Next concrete step…"
            style={{ padding: "8px 11px", border: "1.5px solid var(--line)", borderRadius: 10, fontSize: 13, fontFamily: "var(--sans)", color: "var(--ink)", outline: "none" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>review in</label>
            <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 56, padding: "6px 8px", border: "1.5px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>days</span>
            <button className="initbtn" onClick={saveNext} disabled={busy} style={{ marginLeft: "auto" }}>Save</button>
            <button className="initbtn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <button className={cn("initbtn", !i.nextAction && "warn")} onClick={() => setEditing(true)}>
            {i.nextAction ? "Update next action" : "Add next action"}
          </button>
          {i.stage !== "adopted" && (
            <button className="initbtn" onClick={advance} disabled={busy}>
              Advance →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
