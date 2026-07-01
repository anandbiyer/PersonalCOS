import { getCurrentOwnerId } from "@/lib/auth";
import { getRetention } from "@/lib/db/repo/settings";
import { listFacts } from "@/lib/db/repo/facts";
import { listDaySummaries, listDayHistory } from "@/lib/db/repo/summaries";
import { MemoryView } from "@/components/memory-view";

/** Memory / Settings (FR47/FR48): retention control + "what I remember" +
 *  history by day. */
export default async function MemoryPage() {
  const ownerId = await getCurrentOwnerId();
  const settings = await getRetention(ownerId);
  const facts = await listFacts(ownerId, { activeOnly: true });
  const summaries = await listDaySummaries(ownerId, 1);
  const history = await listDayHistory(ownerId, 30);

  return (
    <MemoryView
      settings={settings}
      facts={facts.map((f) => ({ id: f.id, kind: f.kind, value: f.value }))}
      summary={summaries[0]?.summaryText ?? null}
      history={history}
    />
  );
}
