import { openai, openaiEnabled } from "./openai";

/**
 * Speech-to-text for voice capture (FR29). OpenAI Whisper-class transcription.
 * Office routing: per the owner's decision, cloud AI is permitted for all
 * portfolios (this relaxes NFR-2 for office voice — recorded in the plan).
 */
export function sttEnabled(): boolean {
  return openaiEnabled();
}

export async function transcribe(file: File): Promise<string> {
  if (!openaiEnabled()) {
    throw new Error("STT key not set (OPENAI_API_KEY or STT_API_KEY).");
  }
  const res = await openai().audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return res.text.trim();
}
