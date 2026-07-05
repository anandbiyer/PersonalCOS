import { eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { users, audit } from "@/lib/db/schema";
import { shouldSuppressNotification } from "@/lib/planner/quiet-hours";
import { aiOffline } from "@/lib/ai/offline";

/**
 * Per-user notification dispatch (FR6 channel/quiet-hours governance, FR38
 * channels). Web Push is the intended primary; Pushover/Telegram/email are
 * alternatives. Channels are per-tenant (users.channels), so a notification
 * reaches exactly one tenant. Every dispatch is recorded as an audit receipt,
 * so the system is testable even with no channel configured.
 */
export type NotifyKind = "brief" | "reminder" | "sweep" | "stall" | "nudge";

export interface NotifyInput {
  ownerId: string;
  message: string;
  kind: NotifyKind;
  critical?: boolean;
  at?: Date;
}

export interface NotifyResult {
  suppressed: boolean;
  channel: string | null;
  recorded: boolean;
}

// Scheduled rituals the owner opted into at a fixed time (brief 04:25, sweep
// 21:45) are not treated as quiet-hours interruptions.
const RITUAL_KINDS = new Set<NotifyKind>(["brief", "sweep"]);

type Channels = Record<string, unknown>;

async function getUserChannels(ownerId: string): Promise<Channels> {
  return withOwner(ownerId, async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, ownerId));
    return (u?.channels as Channels) ?? {};
  });
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return true;
  } catch {
    return false;
  }
}

async function sendPushover(userKey: string, text: string): Promise<boolean> {
  const token = process.env.PUSHOVER_TOKEN;
  if (!token || !userKey) return false;
  try {
    // Pushover's API is form-encoded, NOT JSON — a JSON body is silently
    // rejected. Check res.ok so a 4xx (bad token/user) reports as undelivered
    // rather than being falsely recorded as sent.
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, user: userKey, message: text }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Try the user's configured channels in priority order; return the channel
 *  that accepted the message, or null if none is configured/enabled. */
async function deliver(channels: Channels, text: string): Promise<string | null> {
  // Hermetic mode (AI_OFFLINE, used by the test suite) makes NO external network
  // calls — dispatch still records the audit receipt, but nothing is sent. This
  // also keeps tests from firing real Pushover/Telegram pushes via env creds
  // loaded from .env.local.
  if (aiOffline()) return null;

  if (typeof channels.telegram === "string" && process.env.TELEGRAM_BOT_TOKEN) {
    if (await sendTelegram(channels.telegram, text)) return "telegram";
  }
  // User key is per-tenant (users.channels.pushover); fall back to the
  // PUSHOVER_USER env var for single-owner setups where it isn't stored per
  // user. (Fix #1 — makes the PUSHOVER_USER/PUSHOVER_TOKEN Vercel env work.)
  const pushoverKey =
    typeof channels.pushover === "string" ? channels.pushover : process.env.PUSHOVER_USER;
  if (pushoverKey && process.env.PUSHOVER_TOKEN) {
    if (await sendPushover(pushoverKey, text)) return "pushover";
  }
  // web-push / email providers wire in here when configured (Phase 4/5).
  return null;
}

async function record(
  ownerId: string,
  data: { kind: NotifyKind; channel: string | null; suppressed: boolean; message: string; critical: boolean },
): Promise<void> {
  await withOwner(ownerId, async (tx) => {
    await tx.insert(audit).values({
      ownerId,
      changeType: "notification",
      actionTaken: data.suppressed ? "suppressed" : (data.channel ?? "recorded"),
      newValue: data,
    });
  });
}

export async function dispatch(input: NotifyInput): Promise<NotifyResult> {
  const when = input.at ?? new Date();
  const critical = !!input.critical;

  if (!RITUAL_KINDS.has(input.kind) && shouldSuppressNotification(when, { critical })) {
    await record(input.ownerId, {
      kind: input.kind,
      channel: null,
      suppressed: true,
      message: input.message,
      critical,
    });
    return { suppressed: true, channel: null, recorded: true };
  }

  const channels = await getUserChannels(input.ownerId);
  const channel = await deliver(channels, input.message);
  await record(input.ownerId, {
    kind: input.kind,
    channel,
    suppressed: false,
    message: input.message,
    critical,
  });
  return { suppressed: false, channel, recorded: true };
}
