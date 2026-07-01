"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Memory / Settings view (FR47/FR48, BINDING UI §5.5). Retention control
 * (verbatim slider + the tiered windows framed as efficiency hygiene),
 * "what I remember" (rolling summary + editable/deletable durable facts), and
 * history by day (full transcript vs summary-only).
 */
type Settings = { retentionDays: number; completedArchiveMonths: number; summaryRetentionMonths: number };
type Fact = { id: string; kind: string; value: string };
type DayRow = { date: string; full: boolean };

const KIND_CLASS: Record<string, string> = { preference: "pref", commitment: "commit", fact: "fact" };

export function MemoryView({
  settings,
  facts,
  summary,
  history,
}: {
  settings: Settings;
  facts: Fact[];
  summary: string | null;
  history: DayRow[];
}) {
  const router = useRouter();
  const [days, setDays] = useState(settings.retentionDays);
  const [busy, setBusy] = useState(false);

  async function saveRetention(retentionDays: number) {
    setBusy(true);
    try {
      await fetch("/api/settings/retention", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeFact(id: string) {
    await fetch(`/api/memory/facts/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="memwrap">
      <div className="vh">
        <span className="eyebrow">Settings · FR46–FR48</span>
        <h2>Memory</h2>
        <p>What I keep, for how long, and what I remember about how you work.</p>
      </div>

      <div className="memcard">
        <div className="memh">🗂 Verbatim history</div>
        <p className="memp">
          How long I keep the <b>word-for-word</b> transcript. Your <b>summaries and ledger are kept</b> — only the raw
          transcript ages out. <b>Completed work is summarized and dropped early</b>, so finished tasks never cost tokens
          again.
        </p>
        <div className="slidewrap">
          <input
            type="range"
            min={7}
            max={14}
            value={days}
            disabled={busy}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDays(v);
              saveRetention(v);
            }}
          />
          <div className="slideval">
            <span>{days}</span> days <span className="slidehint mono">min 7 · max 14</span>
          </div>
        </div>
        {days < 14 && (
          <div className="memwarn">
            ⚠ Shortening the window purges transcript beyond the new limit on the next daily sweep. Summaries and durable
            facts are kept.
          </div>
        )}
        <p className="memp" style={{ marginTop: 12 }}>
          Beyond the verbatim window (efficiency hygiene — never durable knowledge): completed one-off tasks archive after{" "}
          <b>{settings.completedArchiveMonths} months</b>; day-summaries roll off after{" "}
          <b>{settings.summaryRetentionMonths} months</b>. Preferences, decisions and recurring commitments{" "}
          <b>never expire</b>.
        </p>
      </div>

      <div className="memcard">
        <div className="memh">
          🧠 What I remember <span className="mono memcount">{facts.length} durable facts</span>
        </div>
        <p className="memp">Preferences and commitments I act on. Remove anything — this is yours to correct.</p>
        {summary && (
          <p className="memp">
            <b>Current summary:</b> {summary}
          </p>
        )}
        {facts.length ? (
          facts.map((f) => (
            <div className="factrow" key={f.id}>
              <span className={`fk ${KIND_CLASS[f.kind] ?? "fact"}`}>{f.kind}</span>
              <span className="ft">{f.value}</span>
              <span className="fx" onClick={() => removeFact(f.id)}>
                remove
              </span>
            </div>
          ))
        ) : (
          <div className="empty" style={{ padding: 20 }}>
            Nothing remembered yet — as we talk, I’ll note durable preferences and commitments here.
          </div>
        )}
      </div>

      <div className="memcard">
        <div className="memh">📆 History by day</div>
        <p className="memp">
          Open any day to read it. Days past the verbatim window show the <b>summary only</b>.
        </p>
        <div className="dayhist">
          {history.length ? (
            history.map((d) => (
              <div className="dhrow" key={d.date}>
                <span className="dhd">{d.date}</span>
                <span className={`dhk ${d.full ? "full" : "sum"}`}>{d.full ? "full transcript" : "summary only"}</span>
              </div>
            ))
          ) : (
            <div className="empty" style={{ padding: 20 }}>
              No history yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
