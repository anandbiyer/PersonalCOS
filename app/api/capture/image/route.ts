import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getCurrentOwnerId } from "@/lib/auth";
import { imageToCaptureText, visionEnabled, type ImageMediaType } from "@/lib/ai/vision";
import { ingestText } from "@/lib/capture/ingest";

/**
 * Image capture (FR29): image -> Vercel Blob (provenance) -> Claude Vision ->
 * classify -> ledger. Expects multipart/form-data with an `image` file.
 */
const ALLOWED: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  if (!visionEnabled()) {
    return NextResponse.json(
      { error: "image capture unavailable — ANTHROPIC key not configured" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form" }, { status: 400 });
  }
  const image = form.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json({ error: "missing image file" }, { status: 400 });
  }
  const mediaType = image.type as ImageMediaType;
  if (!ALLOWED.includes(mediaType)) {
    return NextResponse.json({ error: "unsupported image type" }, { status: 415 });
  }

  const bytes = Buffer.from(await image.arrayBuffer());

  // Store the original for provenance/audit (best-effort; Blob token required).
  let blobUrl: string | null = null;
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const uploaded = await put(`captures/${Date.now()}-${image.name}`, bytes, {
        access: "public",
        contentType: mediaType,
      });
      blobUrl = uploaded.url;
    }
  } catch {
    /* provenance upload is non-critical */
  }

  let text: string;
  try {
    text = await imageToCaptureText(bytes.toString("base64"), mediaType);
  } catch {
    return NextResponse.json({ error: "vision parse failed" }, { status: 502 });
  }
  if (!text) {
    return NextResponse.json({ error: "nothing actionable found in image" }, { status: 422 });
  }

  const tz = (form.get("tz") as string) || undefined; // device timezone (FR42)
  const ownerId = await getCurrentOwnerId();
  const result = await ingestText(ownerId, text, "image", tz);
  return NextResponse.json({ ...result, parsed: text, blobUrl });
}
