import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Clerk middleware attaches the auth context when configured. It is
 * non-protecting by default — unauthenticated requests resolve to the dev
 * tenant (see lib/auth). To enforce the single-account gate in production,
 * call auth.protect() here behind a REQUIRE_AUTH flag.
 */
const enabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default enabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals and static files; run on app routes + API.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
