import { getToken } from "@/lib/db/repo/connectors";

/**
 * Robinhood read-only investments connector (FR34).
 *
 * SAFETY: this is a full *trading* MCP server. We call ONLY the five
 * owner-approved read tools, via an allowlist. Any other tool — especially
 * place/cancel/review order tools — is hard-rejected. No order capability is
 * ever exercised; status only, never advice.
 */
export const ROBINHOOD_ALLOWLIST = new Set<string>([
  "get_accounts",
  "get_portfolio",
  "get_equity_positions",
  "get_equity_quotes",
  "get_option_positions",
]);

// Defence in depth: never allow anything matching a mutating/trading verb.
const DENY_PATTERN = /place|cancel|review|order|add_|remove|create|update|follow|unfollow|run_|scan|watchlist/i;

/** Throws unless the tool is explicitly allowlisted AND not a mutating verb. */
export function assertAllowed(toolName: string): void {
  if (DENY_PATTERN.test(toolName) || !ROBINHOOD_ALLOWLIST.has(toolName)) {
    throw new Error(`Robinhood tool '${toolName}' is not permitted — read-only connector.`);
  }
}

export function robinhoodConfigured(): boolean {
  return !!process.env.ROBINHOOD_MCP_URL;
}

export interface Holding {
  symbol: string;
  qty: number;
  value: number;
  dayChangePct: number;
}

export interface PortfolioStatus {
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  holdings: Holding[];
  allocation: { label: string; pct: number }[];
  concentration: { symbol: string; pct: number } | null;
}

/** Pure computation (testable) from already-parsed Robinhood reads. */
export function computePortfolioStatus(input: {
  totalValue: number;
  breakdown?: { label: string; value: number }[];
  positions: { symbol: string; quantity: number }[];
  quotes: Record<string, { price: number; close: number }>;
}): PortfolioStatus {
  const holdings: Holding[] = input.positions.map((p) => {
    const q = input.quotes[p.symbol] ?? { price: 0, close: 0 };
    const value = p.quantity * q.price;
    const dayChangePct = q.close > 0 ? ((q.price - q.close) / q.close) * 100 : 0;
    return { symbol: p.symbol, qty: p.quantity, value, dayChangePct };
  });

  const dayChange = input.positions.reduce((sum, p) => {
    const q = input.quotes[p.symbol] ?? { price: 0, close: 0 };
    return sum + p.quantity * (q.price - q.close);
  }, 0);

  const prev = input.totalValue - dayChange;
  const dayChangePct = prev > 0 ? (dayChange / prev) * 100 : 0;

  const allocation = (input.breakdown ?? []).map((b) => ({
    label: b.label,
    pct: input.totalValue > 0 ? Math.round((b.value / input.totalValue) * 100) : 0,
  }));

  const top = [...holdings].sort((a, b) => b.value - a.value)[0];
  const concentration =
    top && input.totalValue > 0
      ? { symbol: top.symbol, pct: Math.round((top.value / input.totalValue) * 100) }
      : null;

  return { totalValue: input.totalValue, dayChange, dayChangePct, holdings, allocation, concentration };
}

/**
 * Live read-only fetch via the Robinhood MCP server. Returns null when not
 * connected (no token) or on any error, so /investments shows the not-connected
 * state. Every tool call passes through assertAllowed.
 */
export async function getPortfolioStatus(ownerId: string): Promise<PortfolioStatus | null> {
  if (!robinhoodConfigured()) return null;
  const token = await getToken(ownerId, "robinhood");
  if (!token) return null;

  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );

    const transport = new StreamableHTTPClientTransport(new URL(process.env.ROBINHOOD_MCP_URL!), {
      requestInit: { headers: { Authorization: `Bearer ${token.accessToken}` } },
    });
    const client = new Client({ name: "personal-chief-of-staff", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    const call = async (name: string, args: Record<string, unknown>) => {
      assertAllowed(name); // hard guard on every call
      const res = await client.callTool({ name, arguments: args });
      return parseToolJson(res);
    };

    const accounts = await call("get_accounts", {});
    const accountNumber = pickAccountNumber(accounts);
    const portfolio = await call("get_portfolio", { account_number: accountNumber });
    const positionsRaw = await call("get_equity_positions", { account_number: accountNumber });
    const positions = parsePositions(positionsRaw);
    const quotesRaw =
      positions.length > 0 ? await call("get_equity_quotes", { symbols: positions.map((p) => p.symbol) }) : {};
    const quotes = parseQuotes(quotesRaw);

    await client.close();
    return computePortfolioStatus({
      totalValue: pickTotalValue(portfolio),
      breakdown: pickBreakdown(portfolio),
      positions,
      quotes,
    });
  } catch {
    return null;
  }
}

/* ---- defensive parsers (shapes finalised against live data at connect-test) ---- */
function parseToolJson(res: unknown): unknown {
  const content = (res as { content?: { type: string; text?: string }[] })?.content;
  const text = content?.find((c) => c.type === "text")?.text;
  if (!text) return res;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function pickAccountNumber(accounts: unknown): string {
  const arr = Array.isArray(accounts) ? accounts : (accounts as { results?: unknown[] })?.results ?? [];
  const first = (arr as { account_number?: string }[])[0];
  return first?.account_number ?? "";
}
function pickTotalValue(p: unknown): number {
  const o = p as Record<string, unknown>;
  return Number(o?.market_value ?? o?.total_market_value ?? o?.equity ?? 0) || 0;
}
function pickBreakdown(p: unknown): { label: string; value: number }[] {
  const o = p as Record<string, unknown>;
  const out: { label: string; value: number }[] = [];
  if (o?.equity != null) out.push({ label: "Equity", value: Number(o.equity) || 0 });
  if (o?.options_value != null) out.push({ label: "Options", value: Number(o.options_value) || 0 });
  if (o?.cash != null || o?.buying_power != null) out.push({ label: "Cash", value: Number(o.cash ?? o.buying_power) || 0 });
  return out;
}
function parsePositions(raw: unknown): { symbol: string; quantity: number }[] {
  const arr = Array.isArray(raw) ? raw : (raw as { results?: unknown[] })?.results ?? [];
  return (arr as { symbol?: string; instrument_symbol?: string; quantity?: string | number }[])
    .map((p) => ({ symbol: String(p.symbol ?? p.instrument_symbol ?? ""), quantity: Number(p.quantity) || 0 }))
    .filter((p) => p.symbol && p.quantity > 0);
}
function parseQuotes(raw: unknown): Record<string, { price: number; close: number }> {
  const arr = Array.isArray(raw) ? raw : (raw as { results?: unknown[] })?.results ?? [];
  const out: Record<string, { price: number; close: number }> = {};
  for (const q of arr as { symbol?: string; last_trade_price?: string; price?: string; previous_close?: string; close?: string }[]) {
    if (!q.symbol) continue;
    out[q.symbol] = {
      price: Number(q.last_trade_price ?? q.price) || 0,
      close: Number(q.previous_close ?? q.close) || 0,
    };
  }
  return out;
}
