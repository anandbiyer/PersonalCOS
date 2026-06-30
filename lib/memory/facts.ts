import { anthropic, modelFor } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import { addFact, updateFact, listFacts } from "@/lib/db/repo/facts";
import { embed, embeddingsEnabled } from "@/lib/ai/embeddings";
import { indexEntity } from "@/lib/db/repo/embeddings";

type Op = "ADD" | "UPDATE" | "DELETE" | "NOOP";
interface FactOp {
  op: Op;
  kind?: "preference" | "commitment" | "fact";
  subject?: string;
  value?: string;
}

/**
 * Write-before-compaction extraction (FR46 §4.3). A cheap Haiku pass per turn
 * emits ADD/UPDATE/DELETE/NOOP over durable facts, so by the time raw turns age
 * out everything actionable is already structured. Conservative on purpose —
 * stable, reusable knowledge only (transient task detail lives in the ledger).
 *
 * Offline / unkeyed → deterministic no-op (hermetic + a hard cost floor).
 * Best-effort: never throws into the orchestrator. Returns # of facts changed.
 */
export async function extractFacts(
  ownerId: string,
  turnText: string,
  sourceTurnId?: string,
): Promise<number> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return 0;
  try {
    const existing = await listFacts(ownerId, { activeOnly: true });
    const msg = await anthropic().messages.create({
      model: modelFor(undefined, "extract"),
      max_tokens: 400,
      system:
        "Extract DURABLE facts / preferences / commitments worth remembering long-term from the " +
        "manager's message. Be conservative: stable, reusable knowledge only — never transient task " +
        "detail (that already lives in the ledger). Office uses coded references (Client A). Respond " +
        'with ONLY a JSON array of {op:"ADD|UPDATE|DELETE|NOOP", kind:"preference|commitment|fact", ' +
        'subject, value}. ADD new durable knowledge; DELETE (by value match) when the message negates ' +
        "an existing fact; NOOP when nothing durable.",
      messages: [
        {
          role: "user",
          content:
            `Existing facts:\n${existing.map((f) => `- [${f.kind}] ${f.value}`).join("\n") || "(none)"}` +
            `\n\nMessage: ${turnText}`,
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "[]";
    const ops = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)) as FactOp[];

    let changed = 0;
    for (const o of ops) {
      if ((o.op === "ADD" || o.op === "UPDATE") && o.value && o.kind) {
        const f = await addFact(ownerId, {
          kind: o.kind,
          subject: o.subject ?? null,
          value: o.value,
          sourceTurnId: sourceTurnId ?? null,
        });
        changed++;
        if (embeddingsEnabled()) {
          const vec = await embed(o.value);
          if (vec) await indexEntity(ownerId, "fact", f.id, vec, "fact");
        }
      } else if (o.op === "DELETE" && o.value) {
        const needle = o.value.toLowerCase();
        const match = existing.find(
          (e) =>
            e.value.toLowerCase().includes(needle) ||
            needle.includes(e.value.toLowerCase()),
        );
        if (match) {
          await updateFact(ownerId, match.id, { active: false });
          changed++;
        }
      }
    }
    return changed;
  } catch {
    return 0;
  }
}
