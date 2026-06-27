import { aiOffline } from "@/lib/ai/offline";
import { assertNotOffice } from "./policy";
import type { Portfolio } from "@/lib/ai/types";

/**
 * Tavily web-search connector (FR20/FR21). Non-confidential queries only —
 * office content is refused (NFR-8). Returns [] when unconfigured/offline so
 * callers degrade to LLM-only.
 */
export interface WebResult {
  title: string;
  url: string;
  content: string;
}

export function tavilyEnabled(): boolean {
  return !aiOffline() && !!process.env.TAVILY_API_KEY;
}

export async function tavilySearch(
  query: string,
  opts: { maxResults?: number; portfolio?: Portfolio } = {},
): Promise<WebResult[]> {
  assertNotOffice(opts.portfolio, "Tavily");
  if (!tavilyEnabled()) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: opts.maxResults ?? 5,
        search_depth: "basic",
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
    return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, content: r.content }));
  } catch {
    return [];
  }
}
