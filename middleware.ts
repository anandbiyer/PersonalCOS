import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Clerk middleware attaches the auth context when configured. It is
 * non-protecting by default — unauthenticated requests resolve to the dev
 * tenant (see lib/auth).
 *
 * When REQUIRE_AUTH=1 (set in Vercel once accounts are ready), every route is
 * gated behind sign-in EXCEPT the always-public ones below. This is a kill-
 * switch: leave it unset to keep the open dev-tenant behaviour; set it to lock
 * the deployment down before sharing the URL.
 */
const enabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const requireAuth = process.env.REQUIRE_AUTH === "1";

/**
 * Routes that MUST stay public even when auth is enforced:
 *  - /sign-in, /sign-up   — the auth pages themselves (+ Clerk sub-routes)
 *  - /api/clerk-webhook    — called by Clerk's servers (no user session); gating
 *                            it would break user-sync to Postgres
 *  - /api/cron/*           — called by Vercel Cron with CRON_SECRET (no session);
 *                            it has its own cronAuthorized() check
 */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/clerk-webhook",
  "/api/cron/(.*)",
]);

export default enabled
  ? clerkMiddleware(async (auth, req) => {
      if (requireAuth && !isPublicRoute(req)) {
        await auth.protect();
      }
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals and static files; run on app routes + API.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
