import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOwnerId } from "@/lib/auth";
import { saveToken, deleteToken } from "@/lib/db/repo/connectors";
import { encryptionEnabled } from "@/lib/crypto";

/**
 * One-time encrypted token connect for Robinhood (FR34). The user supplies an
 * access (and optional refresh) token obtained from Robinhood's OAuth; we store
 * it encrypted, per-user. Read-only is enforced at the connector layer.
 */
const Body = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!encryptionEnabled()) {
    return NextResponse.json({ error: "TOKEN_ENCRYPTION_KEY not configured" }, { status: 503 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const ownerId = await getCurrentOwnerId();
  await saveToken(ownerId, "robinhood", {
    accessToken: parsed.data.accessToken,
    refreshToken: parsed.data.refreshToken ?? null,
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    scopes: parsed.data.scopes ?? "read-only",
  });
  return NextResponse.json({ ok: true, connected: true });
}

export async function DELETE() {
  const ownerId = await getCurrentOwnerId();
  await deleteToken(ownerId, "robinhood");
  return NextResponse.json({ ok: true, connected: false });
}
