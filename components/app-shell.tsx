import Link from "next/link";
import { Nav } from "./nav";
import { TopBar } from "./top-bar";
import { CaptureBar } from "./capture-bar";

/** The persistent three-mode shell from the mockup: brand, top bar, left nav,
 *  scrollable main, and the pinned multi-modal capture bar. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Link href="/brief" className="brand" title="Back to dashboard">
        <div className="logo" />
        <h1>
          Chief of Staff<span>COMMAND DECK</span>
        </h1>
      </Link>

      <TopBar />
      <Nav />

      <main className="main">{children}</main>

      <CaptureBar />
    </div>
  );
}
