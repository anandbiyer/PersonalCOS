import { getCurrentOwnerId } from "@/lib/auth";
import { listInbox, listSent } from "@/lib/db/repo/handoff";
import { HandoffCompose } from "@/components/handoff-compose";
import { InboxCard } from "@/components/inbox-card";

export default async function InboxPage() {
  const ownerId = await getCurrentOwnerId();
  const incoming = await listInbox(ownerId);
  const sent = await listSent(ownerId);

  return (
    <section>
      <div className="vh">
        <span className="eyebrow">Household · FR37</span>
        <h2>Inbox</h2>
        <p>Incoming hand-offs — accept to copy into your own ledger, or decline. Senders see only the status.</p>
      </div>

      <HandoffCompose />

      <h3 style={{ fontSize: 13, fontWeight: 800, margin: "20px 0 12px" }}>Incoming</h3>
      {incoming.length === 0 ? (
        <div className="empty">No pending hand-offs.</div>
      ) : (
        incoming.map((i) => <InboxCard key={i.id} item={{ id: i.id, title: i.title, note: i.note }} />)
      )}

      {sent.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 800, margin: "22px 0 12px" }}>Sent</h3>
          {sent.map((s) => (
            <div className="inboxcard" key={s.id}>
              <div className="from">→</div>
              <div className="body">
                <div className="ttl">{s.title}</div>
                <div className="meta">Status: {s.status}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
