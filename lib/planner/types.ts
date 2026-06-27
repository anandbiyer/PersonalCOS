import type { Portfolio } from "@/lib/ai/types";

/** Minimal shapes the planner needs — repo rows satisfy these structurally,
 *  and tests can build them without the full DB types. */
export interface PlanTask {
  id: string;
  name: string;
  portfolio: Portfolio;
  status: string;
  dueDate: Date | string | null;
  priority?: string | null;
  owner?: string | null;
  effortMin?: number | null;
  dependsOn?: string[] | null;
  updatedAt?: Date | string | null;
  completedAt?: Date | string | null;
}

export interface PlanEvent {
  id: string;
  date: Date | string;
  type?: string | null;
  status?: string | null;
}

export interface PlanException {
  id: string;
  date: Date | string;
  overriddenBlock?: string | null;
  replacement?: string | null;
}

export interface PlanData {
  tasks?: PlanTask[];
  events?: PlanEvent[];
  exceptions?: PlanException[];
}

export interface CalItem {
  key: string;
  title: string;
  portfolio?: Portfolio;
  kind: "block" | "task" | "event" | "exception";
  start?: string; // "HH:MM"
  end?: string;
  startMin?: number;
  allDay?: boolean;
}

export interface DayPlan {
  date: Date;
  items: CalItem[];
}
