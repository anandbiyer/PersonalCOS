import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import {
  adminUpsertUserFromClerk,
  adminDeleteUserByClerkId,
} from "@/lib/db/admin";

/**
 * Clerk webhook (NFR-9): syncs users into our Postgres so RLS and the household
 * roster have an identity to key on. Clerk holds only login identity; all app
 * data stays here. Verified with svix using CLERK_WEBHOOK_SECRET.
 */
type ClerkEvent = {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: { email_address: string }[];
  };
};

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ClerkEvent;
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const { type, data } = event;
  if (type === "user.created" || type === "user.updated") {
    const name =
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
      data.email_addresses?.[0]?.email_address ||
      "User";
    await adminUpsertUserFromClerk({ clerkId: data.id, displayName: name });
  } else if (type === "user.deleted") {
    await adminDeleteUserByClerkId(data.id);
  }

  return NextResponse.json({ ok: true });
}
