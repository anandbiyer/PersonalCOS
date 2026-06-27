import type { Portfolio } from "@/lib/ai/types";

/**
 * Connector trust & scoping policy (NFR-8). Cloud connectors (Tavily, Notion,
 * Mem0, Robinhood) serve personal/dev only — office content must never reach a
 * third-party cloud connector (owner-confirmed boundary: office stays in
 * Postgres/local).
 */
export type TrustTier = "directory" | "first_party" | "community" | "reference";

export function isOffice(portfolio: Portfolio | null | undefined): boolean {
  return portfolio === "office";
}

/** Throw if office content is about to be sent to a third-party cloud connector. */
export function assertNotOffice(portfolio: Portfolio | null | undefined, connector: string): void {
  if (isOffice(portfolio)) {
    throw new Error(`Office content must not be sent to the ${connector} cloud connector (NFR-8).`);
  }
}
