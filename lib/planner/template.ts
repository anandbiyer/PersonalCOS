import type { Portfolio } from "@/lib/ai/types";
import { isWeekend } from "./dates";

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
