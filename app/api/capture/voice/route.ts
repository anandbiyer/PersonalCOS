import { NextRequest, NextResponse } from "next/server";
import { getCurrentOwnerId } from "@/lib/auth";
import { sttEnabled, transcribe } from "@/lib/ai/stt";
import { ingestText } from "@/lib/capture/ingest";

/**
 * Voice capture (FR29): audio -> STT (OpenAI Whisper-class) -> classify ->
 * ledger. Expects multipart/form-data with an `audio` file.
 */
export async function POST(req: NextRequest) {
  if (!sttEnabled()) {
    return NextResponse.json(
      { error: "voice capture unavailable — STT key not configured" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "missing audio file" }, { status: 400 });
  }

  let text: string;
  try {
    text = await transcribe(audio);
  } catch {
    return NextResponse.json({ error: "transcription failed" }, { status: 502 });
  }
  if (!text) {
    return NextResponse.json({ error: "empty transcription" }, { status: 422 });
  }

  const tz = (form.get("tz") as string) || undefined; // device timezone (FR42)
  const ownerId = await getCurrentOwnerId();
  const result = await ingestText(ownerId, text, "voice", tz);
  return NextResponse.json({ ...result, transcript: text });
}
