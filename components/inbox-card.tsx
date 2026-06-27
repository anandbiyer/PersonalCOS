"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type InboxItem = {
  id: string;
  title: string;
  note: string | null;
};

/** Incoming hand-off (FR37): accept (copy-on-accept into your ledger) or
 *  decline. Either way the sender only learns the status. */
export function InboxCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "accept" | "decline") {
    setBusy(true);
    const res = await fetch(`/api/handoff/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="inboxcard">
      <div className="from">⇄</div>
      <div className="body">
        <div className="ttl">{item.title}</div>
        {item.note && <div className="meta">{item.note}</div>}
      </div>
      <div className="acts">
        <button className="ibtn acc" disabled={busy} onClick={() => act("accept")}>Accept</button>
        <button className="ibtn dec" disabled={busy} onClick={() => act("decline")}>Decline</button>
      </div>
    </div>
  );
}
