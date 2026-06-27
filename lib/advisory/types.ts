import type { Portfolio } from "@/lib/ai/types";

export interface AdviceOption {
  title: string;
  detail: string;
  tradeoffs: string;
}

export interface Advice {
  situation: string;
  options: AdviceOption[];
  recommendedIndex: number;
  reasoning: string;
  portfolio: Portfolio;
  via: "llm" | "heuristic";
}
