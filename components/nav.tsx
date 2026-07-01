"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Item = {
  href: string;
  label: string;
  badge?: { text: string; tone?: "warn" | "rose" };
};

type Group = { mode: string; items: Item[] };

// Line-icons per route, matching the mockup's left-nav glyphs (18px, stroked).
const ICONS: Record<string, ReactNode> = {
  "/brief": <path d="M3 5h18M3 12h18M3 19h12" />,
  "/tasks": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9h8M8 14h5" />
    </>
  ),
  "/invest": <path d="M4 19V9M10 19V5M16 19v-6M21 19H3" />,
  "/calendar": (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  "/waiting": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  "/reports": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/consult": <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-5.2A8 8 0 1 1 21 12z" />,
  "/initiatives": (
    <>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  "/people": (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 15c3 0 5 2 5 5" />
    </>
  ),
  "/inbox": <path d="M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  "/memory": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
};

function NavIcon({ href }: { href: string }) {
  const glyph = ICONS[href];
  if (!glyph) return null;
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      {glyph}
    </svg>
  );
}

// Left nav grouped by the three systems + Household (mockup IA).
const GROUPS: Group[] = [
  { mode: "Brief", items: [{ href: "/brief", label: "Today" }] },
  {
    mode: "System of Record",
    items: [
      { href: "/tasks", label: "Tasks ledger" },
      { href: "/invest", label: "Investments" },
    ],
  },
  {
    mode: "System of Action",
    items: [
      { href: "/calendar", label: "Calendar" },
      { href: "/waiting", label: "Waiting on", badge: { text: "0", tone: "warn" } },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    mode: "System of Judgment",
    items: [
      { href: "/consult", label: "Consult" },
      { href: "/initiatives", label: "Initiatives" },
      { href: "/people", label: "People" },
    ],
  },
  { mode: "Household", items: [{ href: "/inbox", label: "Inbox" }] },
  { mode: "Settings", items: [{ href: "/memory", label: "Memory" }] },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {GROUPS.map((g) => (
        <div key={g.mode}>
          <div className="mode">{g.mode}</div>
          {g.items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn("navitem", active && "on")}
              >
                <NavIcon href={it.href} />
                {it.label}
                {it.badge && (
                  <span className={cn("badge", it.badge.tone)}>{it.badge.text}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
