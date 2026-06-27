import type { Portfolio } from "@/lib/ai/types";

export function portfolioClass(p?: Portfolio | null): string {
  return p === "office"
    ? "p-office"
    : p === "personal_dev"
      ? "p-dev"
      : p === "personal_life"
        ? "p-life"
        : "p-none";
}

export function portfolioLabel(p?: Portfolio | null): string {
  return p === "office"
    ? "Office"
    : p === "personal_dev"
      ? "Personal Dev"
      : p === "personal_life"
        ? "Personal Life"
        : "—";
}
