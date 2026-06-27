import { anthropic, MODELS } from "./index";
import { aiOffline } from "./offline";

/**
 * Image capture via Claude Vision (FR29). Reads a photo/screenshot (itinerary,
 * whiteboard, bill/renewal) into a concise capture line that flows through the
 * same classify -> ledger path.
 */
export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export function visionEnabled(): boolean {
  return !aiOffline() && Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function imageToCaptureText(
  base64: string,
  mediaType: ImageMediaType,
): Promise<string> {
  const client = anthropic();
  const msg = await client.messages.create({
    model: MODELS.reasoning,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text:
              "Read this image and extract the single most actionable item to capture " +
              "(a task, event, or due date). Reply with ONE concise line suitable for a " +
              "to-do ledger. For a bill/renewal include the item and due date. For office " +
              "content use a coded reference (e.g. 'Client F'), never verbatim client names.",
          },
        ],
      },
    ],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}
