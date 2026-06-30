"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  badge?: { text: string; tone?: "warn" | "rose" };
};

type Group = { mode: string; items: Item[] };

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
