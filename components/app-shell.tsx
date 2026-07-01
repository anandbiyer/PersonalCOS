import Link from "next/link";
import { Nav } from "./nav";
import { TopBar } from "./top-bar";
import { CaptureBar } from "./capture-bar";
import { getNavCounts } from "@/lib/nav/counts";

/** The persistent three-mode shell from the mockup: brand, top bar, left nav,
 *  scrollable main, and the pinned multi-modal capture bar. Server component so
 *  the nav badge counts are computed live per request. */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const counts = await getNavCounts();
  return (
    <div className="app">
      <Link href="/brief" className="brand" title="Back to dashboard">
        <div className="logo" />
        <h1>
          Chief of Staff<span>COMMAND DECK</span>
        </h1>
      </Link>

      <TopBar />
      <Nav counts={counts} />

      <main className="main">{children}</main>

      <CaptureBar />
    </div>
  );
}
