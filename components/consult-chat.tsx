"use client";

import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

/** Consult / sounding-board chat (FR33). Talks things through; never files
 *  unless you explicitly tap "File this", which routes to normal capture. */
export function ConsultChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState<Record<number, boolean>>({});

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: res.ok ? data.reply : "Something went wrong." }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Network error." }]);
    } finally {
      setBusy(false);
    }
  }

  async function fileThis(idx: number, text: string) {
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: "text" }),
    });
    if (res.ok) setFiled((f) => ({ ...f, [idx]: true }));
  }

  return (
    <div className="consultwrap">
      <div className="consult-note">
        💬 Your sounding board. Think out loud or ask for an opinion — nothing here gets filed unless you tap “File this”.
      </div>

      <div className="thread">
        {messages.map((m, idx) => (
          <div key={idx}>
            <div className={`msg ${m.role === "user" ? "me" : "cos"}`}>
              <div className="ava">{m.role === "user" ? "A" : "◐"}</div>
              <div className="bubble">{m.content}</div>
            </div>
            {m.role === "user" && (
              <div className="capnote">
                <button onClick={() => fileThis(idx, m.content)} disabled={filed[idx]}>
                  {filed[idx] ? "Filed ✓" : "File this"}
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg cos"><div className="ava">◐</div><div className="bubble">…</div></div>}
      </div>

      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="What's on your mind?"
          aria-label="Consult input"
        />
        <button className="send" onClick={send} disabled={busy || !input.trim()}>
          Send →
        </button>
      </div>
    </div>
  );
}
