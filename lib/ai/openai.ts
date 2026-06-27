import OpenAI from "openai";
import { aiOffline } from "./offline";

/**
 * OpenAI client — used ONLY for speech-to-text (Whisper-class) and embeddings,
 * since Anthropic provides neither. Reasoning/classification/Vision stay on
 * Claude. Reads OPENAI_API_KEY, falling back to STT_API_KEY so a single OpenAI
 * credential can serve both STT and embeddings.
 */
export function openaiKey(): string | undefined {
  return process.env.OPENAI_API_KEY ?? process.env.STT_API_KEY;
}

export function openaiEnabled(): boolean {
  return !aiOffline() && Boolean(openaiKey());
}

let cached: OpenAI | null = null;

export function openai(): OpenAI {
  const apiKey = openaiKey();
  if (!apiKey) {
    throw new Error("OpenAI key not set (OPENAI_API_KEY or STT_API_KEY).");
  }
  cached ??= new OpenAI({ apiKey });
  return cached;
}
