import { assertNotOffice } from "./policy";
import type { Portfolio } from "@/lib/ai/types";

/**
 * Notion second-brain connector (FR31). Personal/dev notes only — office notes
 * stay in Postgres and are never sent here (owner-confirmed boundary).
 */
export interface NoteHit {
  title: string;
  url: string;
}

export function notionEnabled(): boolean {
  return !!process.env.NOTION_API_KEY;
}

type NotionPage = {
  url?: string;
  properties?: Record<string, { title?: { plain_text: string }[] }>;
};

function titleOf(page: NotionPage): string {
  const props = page.properties ?? {};
  for (const key of Object.keys(props)) {
    const t = props[key]?.title;
    if (t && t.length) return t.map((x) => x.plain_text).join("");
  }
  return "Untitled";
}

export async function notionSearch(
  query: string,
  opts: { maxResults?: number; portfolio?: Portfolio } = {},
): Promise<NoteHit[]> {
  assertNotOffice(opts.portfolio, "Notion");
  if (!notionEnabled()) return [];
  try {
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, page_size: opts.maxResults ?? 5 }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: NotionPage[] };
    return (data.results ?? []).map((p) => ({ title: titleOf(p), url: p.url ?? "" }));
  } catch {
    return [];
  }
}
