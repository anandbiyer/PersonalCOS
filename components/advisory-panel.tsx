"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Option = { title: string; detail: string; tradeoffs: string };
type Advice = {
  situation: string;
  options: Option[];
  recommendedIndex: number;
  reasoning: string;
  portfolio: "office" | "personal_dev" | "personal_life";
  via: string;
};

/** Advisory loop UI (FR15): situation -> options + reasoned pick -> confirm ->
 *  operationalise into a tracked initiative. */
export function AdvisoryPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [situation, setSituation] = useState("");
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function getAdvice() {
    if (situation.trim().length < 3 || busy) return;
    setBusy(true);
    setAdvice(null);
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: situation.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setAdvice(data);
        setPicked(data.recommendedIndex ?? 0);
      }
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!advice || picked === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/advisory/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation: advice.situation,
          options: advice.options,
          chosenIndex: picked,
          reasoning: advice.reasoning,
          portfolio: advice.portfolio,
        }),
      });
      if (res.ok) {
        setOpen(false);
        setSituation("");
        setAdvice(null);
        setPicked(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 22 }}>
        <button className="send" style={{ height: 40 }} onClick={() => setOpen(true)}>
          💡 Get advice → new initiative
        </button>
      </div>
    );
  }

  return (
    <div className="advisory">
      <textarea
        value={situation}
        onChange={(e) => setSituation(e.target.value)}
        placeholder="Describe a situation, goal, or paste discussion notes…"
      />
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button className="send" style={{ height: 38 }} onClick={getAdvice} disabled={busy}>
          {busy && !advice ? "Thinking…" : "Get options"}
        </button>
        <button className="initbtn" onClick={() => setOpen(false)}>Cancel</button>
      </div>

      {advice && (
        <div>
          {advice.options.map((o, idx) => (
            <div key={idx} className={cn("opt", picked === idx && "pick")} onClick={() => setPicked(idx)}>
              <div className="ot">
                {o.title}
                {idx === advice.recommendedIndex && " ⭐"}
              </div>
              <div className="od">{o.detail}</div>
              <div className="otr"><b>Trade-offs:</b> {o.tradeoffs}</div>
            </div>
          ))}
          {advice.reasoning && (
            <div className="adv-rec"><b>Pick:</b> {advice.reasoning}</div>
          )}
          <div style={{ marginTop: 12 }}>
            <button className="send" style={{ height: 38 }} onClick={commit} disabled={busy || picked === null}>
              {busy ? "Creating…" : "Confirm → create initiative"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
