"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Add a person to the enablement register (FR19). Coded references only. */
export function AddPerson() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [role, setRole] = useState("");
  const [behaviour, setBehaviour] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!code.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), role: role.trim(), behaviourToEnable: behaviour.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setCode(""); setRole(""); setBehaviour(""); setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button className="send" style={{ height: 38, marginBottom: 18 }} onClick={() => setOpen(true)}>
        + Add person
      </button>
    );
  }

  const inp = { padding: "9px 12px", border: "1.5px solid var(--line)", borderRadius: 10, fontSize: 13, fontFamily: "var(--sans)", color: "var(--ink)", outline: "none" } as const;
  return (
    <div className="advisory" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <input style={inp} placeholder="Coded reference (e.g. Owner A)" value={code} onChange={(e) => setCode(e.target.value)} />
      <input style={inp} placeholder="Role (e.g. SpreadX lead)" value={role} onChange={(e) => setRole(e.target.value)} />
      <input style={inp} placeholder="Enable: what you're trying to enable" value={behaviour} onChange={(e) => setBehaviour(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="send" style={{ height: 38 }} onClick={save} disabled={busy || !code.trim()}>Save</button>
        <button className="initbtn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
