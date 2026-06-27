import { getCurrentOwnerId } from "@/lib/auth";
import { listPeople } from "@/lib/db/repo/people";
import { AddPerson } from "@/components/add-person";

export default async function PeoplePage() {
  const ownerId = await getCurrentOwnerId();
  const people = await listPeople(ownerId);

  return (
    <section>
      <div className="vh">
        <span className="eyebrow">System of Judgment · FR19</span>
        <h2>People — enablement register</h2>
        <p>Lightweight per-person memory: role, what to enable, last nudge. Coded references only.</p>
      </div>

      <AddPerson />

      {people.length === 0 ? (
        <div className="empty">No one in the register yet — add a coded stakeholder above.</div>
      ) : (
        <div className="grid g3">
          {people.map((p) => (
            <div className="pcard" key={p.id}>
              <div className="ph">
                <div className="av">{p.code.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="nm">{p.code}</div>
                  <div className="rl">{p.role ?? "—"}</div>
                </div>
              </div>
              <div className="en">
                {p.behaviourToEnable && <><b>Enable:</b> {p.behaviourToEnable}<br /></>}
                {p.lastNudge && <><b>Last nudge:</b> {p.lastNudge}</>}
                {!p.behaviourToEnable && !p.lastNudge && "No notes yet."}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
