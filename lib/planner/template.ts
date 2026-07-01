import type { Portfolio } from "@/lib/ai/types";
import { isWeekend, parseHHMM } from "./dates";

/**
 * The owner's deterministic weekly template (Requirements §4). The planner
 * schedules against this by default; only logged schedule_exceptions deviate
 * from it (FR4).
 */
export interface TemplateBlock {
  name: string;
  start: string; // "HH:MM"
  end: string;
  portfolio: Portfolio;
  quiet?: boolean; // Family + Reading are quiet hours (FR6)
}

export const WEEKDAY_TEMPLATE: TemplateBlock[] = [
  { name: "Study (deep focus)", start: "04:30", end: "05:30", portfolio: "personal_dev" },
  { name: "Office", start: "07:30", end: "17:00", portfolio: "office" },
  { name: "Gym / Walk", start: "18:00", end: "20:00", portfolio: "personal_life" },
  { name: "Family", start: "20:00", end: "21:00", portfolio: "personal_life", quiet: true },
  { name: "Reading", start: "21:15", end: "22:00", portfolio: "personal_dev", quiet: true },
];

export const WEEKEND_TEMPLATE: TemplateBlock[] = [
  { name: "Badminton", start: "08:00", end: "10:00", portfolio: "personal_life" },
  { name: "Self-work", start: "10:30", end: "12:30", portfolio: "personal_dev" },
  { name: "Household chores", start: "16:00", end: "17:00", portfolio: "personal_life" },
];

export function templateFor(date: Date): TemplateBlock[] {
  return isWeekend(date) ? WEEKEND_TEMPLATE : WEEKDAY_TEMPLATE;
}

const ALL_BLOCKS: TemplateBlock[] = [...WEEKDAY_TEMPLATE, ...WEEKEND_TEMPLATE];

// Keyword → routine block, so "reschedule my gym" resolves to the Gym / Walk
// template block (which is NOT a ledger task and so never matches matchOpenTask).
const BLOCK_MATCH: { keys: string[]; name: string }[] = [
  { keys: ["study"], name: "Study (deep focus)" },
  { keys: ["office"], name: "Office" },
  { keys: ["gym", "walk"], name: "Gym / Walk" },
  { keys: ["family"], name: "Family" },
  { keys: ["reading"], name: "Reading" },
  { keys: ["badminton"], name: "Badminton" },
  { keys: ["self-work", "self work", "selfwork"], name: "Self-work" },
  { keys: ["household", "chores"], name: "Household chores" },
];

/** Resolve a message to a routine template block by keyword, else null. */
export function matchTemplateBlock(text: string): TemplateBlock | null {
  const t = text.toLowerCase();
  for (const m of BLOCK_MATCH) {
    if (m.keys.some((k) => t.includes(k))) {
      return ALL_BLOCKS.find((b) => b.name === m.name) ?? null;
    }
  }
  return null;
}

/** A routine block's length in minutes (used when it's re-timed as an item). */
export function blockDurationMin(b: TemplateBlock): number {
  return Math.max(15, parseHHMM(b.end) - parseHHMM(b.start));
}
