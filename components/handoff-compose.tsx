"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: string; displayName: string };

/** Compose a cross-user hand-off (FR37): pick the household member, type the
 *  fields, send. Creates an invitation — never a task in their ledger. */
export function HandoffCompose() {
  const router = useRouter();
  const [roster, setRoster] = useState<Member[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/roster")
      .then((r) => r.json())
      .then((d) => {
        setRoster(d.roster ?? []);
        if (d.roster?.[0]) setRecipientId(d.roster[0].id);
      })
      .catch(() => {});
  }, []);

  async function send() {
    if (!recipientId || !title.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId, title: title.trim(), note: note.trim() || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setNote("");
      setMsg("Sent — awaiting their decision");
      router.refresh();
    } else {
      setMsg("Could not send");
    }
  }

  if (roster.length === 0) {
    return (
      <div className="empty" style={{ marginBottom: 18 }}>
        No other household member to hand off to yet.
      </div>
    );
  }

  const inp = { padding: "9px 12px", border: "1.5px solid var(--line)", borderRadius: 10, fontSize: 13, fontFamily: "var(--sans)", color: "var(--ink)", outline: "none", background: "var(--surface)" } as const;
  return (
    <div className="advisory" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Send a hand-off</div>
      <select style={inp} value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
        {roster.map((m) => (
          <option key={m.id} value={m.id}>To: {m.displayName}</option>
        ))}
      </select>
      <input style={inp} placeholder="Task title (e.g. Pick up Aarav — 5 PM)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input style={inp} placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="send" style={{ height: 38 }} onClick={send} disabled={busy || !title.trim()}>Send hand-off</button>
        {msg && <span style={{ fontSize: 12, color: "var(--muted)" }}>{msg}</span>}
      </div>
    </div>
  );
}
