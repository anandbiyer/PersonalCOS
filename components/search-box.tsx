"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Ledger search (FR13). Submits ?q= which the server resolves via semantic
 *  (vector) search when embeddings are enabled, else structured search. */
export function SearchBox({ initial }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    router.push(v ? `/tasks?q=${encodeURIComponent(v)}` : "/tasks");
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        gap: 8,
        margin: "0 0 16px",
        maxWidth: 420,
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the ledger…"
        aria-label="Search tasks"
        style={{
          flex: 1,
          padding: "9px 14px",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          background: "var(--surface)",
          color: "var(--ink)",
          fontSize: 13,
          outline: "none",
          fontFamily: "var(--sans)",
        }}
      />
      <button className="send" style={{ height: 38, padding: "0 16px" }}>
        Search
      </button>
    </form>
  );
}
