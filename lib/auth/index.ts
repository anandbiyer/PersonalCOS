import { adminGetUserByClerkId } from "@/lib/db/admin";

/**
 * Auth + tenant context.
 *
 * Resolves the current owner from Clerk's verified user id (FR36, NFR-9):
 * Clerk authenticates *who you are*; the mapped users.id becomes app.owner_id
 * for Row-Level Security. Falls back to a dev tenant when Clerk isn't
 * configured or there's no session, so local/dev/test runs keep working.
 */
export type Theme = "aurora" | "sunrise";

const DEV_OWNER_ID =
  process.env.DEV_OWNER_ID ?? "00000000-0000-0000-0000-000000000001";

function clerkEnabled(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

async function clerkUserId(): Promise<string | null> {
  if (!clerkEnabled()) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    // No clerk middleware context (e.g. invoked outside a request) — fall back.
    return null;
  }
}

export async function getCurrentOwnerId(): Promise<string> {
  const clerkId = await clerkUserId();
  if (clerkId) {
    const u = await adminGetUserByClerkId(clerkId);
    if (u) return u.id;
  }
  return DEV_OWNER_ID;
}

/** Per-user theme (FR39): from the authenticated user's row; dev override
 *  otherwise. */
export async function getCurrentTheme(): Promise<Theme> {
  const clerkId = await clerkUserId();
  if (clerkId) {
    const u = await adminGetUserByClerkId(clerkId);
    if (u?.theme) return u.theme;
  }
  return process.env.DEV_THEME === "sunrise" ? "sunrise" : "aurora";
}

/** True when a real Clerk session is present (used to gate UI). */
export async function isAuthenticated(): Promise<boolean> {
  return (await clerkUserId()) !== null;
}

export { clerkEnabled };
