"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

/** Top-bar auth controls. Renders only when Clerk is configured; otherwise the
 *  app runs against the dev tenant and shows nothing here. */
export function AuthControls() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="themetoggle">Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </>
  );
}
