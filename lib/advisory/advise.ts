import { anthropic, MODELS } from "@/lib/ai";
import { aiOffline } from "@/lib/ai/offline";
import { heuristicClassify } from "@/lib/ai/classify";
import { heuristicAdvice } from "./options";
import type { Advice, AdviceOption } from "./types";

/**
 * Advisory loop step 1 (FR15): situation -> 2–3 distinct options with
 * trade-offs + a reasoned pick. Claude when available, deterministic fallback
 * otherwise.
 */
export async function advise(situation: string): Promise<Advice> {
  if (aiOffline() || !process.env.ANTHROPIC_API_KEY) return heuristicAdvice(situation);
  try {
    const msg = await anthropic().messages.create({
      model: MODELS.reasoning,
      max_tokens: 1000,
      system:
        "You are a chief of staff. Given a situation, goal, or pasted notes, return 2–3 " +
        "GENUINELY DISTINCT options (different courses of action, not tone variants), each " +
        "with explicit trade-offs, plus a reasoned pick. Office content must use coded " +
        'references. Respond with ONLY JSON: {"options":[{"title":"","detail":"","tradeoffs":""}],' +
        '"recommendedIndex":0,"reasoning":""}.',
      messages: [{ role: "user", content: situation }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
      options?: Partial<AdviceOption>[];
      recommendedIndex?: number;
      reasoning?: string;
    };
    const options: AdviceOption[] = (parsed.options ?? []).slice(0, 3).map((o) => ({
      title: String(o.title ?? ""),
      detail: String(o.detail ?? ""),
      tradeoffs: String(o.tradeoffs ?? ""),
    }));
    if (options.length < 2) return heuristicAdvice(situation);
    const recommendedIndex =
      Number.isInteger(parsed.recommendedIndex) &&
      (parsed.recommendedIndex as number) >= 0 &&
      (parsed.recommendedIndex as number) < options.length
        ? (parsed.recommendedIndex as number)
        : 0;
    return {
      situation,
      options,
      recommendedIndex,
      reasoning: String(parsed.reasoning ?? ""),
      portfolio: heuristicClassify(situation).portfolio,
      via: "llm",
    };
  } catch {
    return heuristicAdvice(situation);
  }
}
