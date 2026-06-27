import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import { getCurrentTheme } from "@/lib/auth";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "Chief of Staff — Command Deck",
  description:
    "Personal Chief of Staff — capture, plan, and drive initiatives to outcomes.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

// Theme (and, from Phase 5, all data) is resolved per authenticated user, so
// rendering is request-time, not build-time. Keeps server theme resolution and
// the DEV_THEME override honest in production.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FR39: theme resolved per user. Phase 0 reads a dev override; Phase 5 reads
  // users.theme for the authenticated user.
  const theme = await getCurrentTheme();

  const tree = (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );

  // Wrap with ClerkProvider only when configured, so dev/test runs without
  // Clerk keys still work (auth falls back to the dev tenant).
  return clerkEnabled ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
