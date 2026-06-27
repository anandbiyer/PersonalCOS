import { NextRequest, NextResponse } from "next/server";
import { notionSearch, notionEnabled } from "@/lib/connectors/notion";

// Second-brain notes search (FR31) over the owner's Notion. Personal/dev only.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ enabled: notionEnabled(), results: [] });
  const results = await notionSearch(q, { maxResults: 6 });
  return NextResponse.json({ enabled: notionEnabled(), results });
}
