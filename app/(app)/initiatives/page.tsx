import { getCurrentOwnerId } from "@/lib/auth";
import { listInitiatives } from "@/lib/db/repo/initiatives";
import { isStalled } from "@/lib/initiatives/invariant";
import { AdvisoryPanel } from "@/components/advisory-panel";
import { InitiativeCard, type InitiativeView } from "@/components/initiative-card";

const COLUMNS: { stage: string; label: string }[] = [
  { stage: "idea", label: "Idea" },
  { stage: "validated", label: "Validated" },
  { stage: "in_dev", label: "In Dev" },
  { stage: "piloted", label: "Piloted" },
  { stage: "adopted", label: "Adopted" },
];

export default async function InitiativesPage() {
  const ownerId = await getCurrentOwnerId();
  const rows = await listInitiatives(ownerId);

  const views: InitiativeView[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    portfolio: r.portfolio,
    stage: r.stage,
    outcome: r.outcome,
    nextAction: r.nextAction,
    stalled: isStalled(r), // compute live so the board is always accurate
  }));

  return (
    <section>
      <div className="vh">
        <span className="eyebrow">System of Judgment</span>
        <h2>Initiatives</h2>
        <p>Every active initiative carries an outcome, a heartbeat, and a next action that is never empty.</p>
      </div>

      <AdvisoryPanel />

      {views.length === 0 ? (
        <div className="empty">No initiatives yet — use “Get advice” above to create one.</div>
      ) : (
        <div className="stageboard">
          {COLUMNS.map((col) => {
            const cards = views.filter((v) => v.stage === col.stage);
            return (
              <div className="stage-col" key={col.stage}>
                <h4>
                  {col.label} <span className="ct">{cards.length}</span>
                </h4>
                {cards.map((v) => (
                  <InitiativeCard key={v.id} i={v} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
