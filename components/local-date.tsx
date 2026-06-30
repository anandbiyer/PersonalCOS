"use client";

import { useEffect, useState } from "react";

/**
 * Render a stored UTC instant as a date in the DEVICE's timezone (FR42).
 * Formatting is deferred to after mount, so the server's UTC interpretation is
 * never shown and there is no hydration mismatch: server + first client render
 * both emit `placeholder`, then the local date appears. Null → an em dash.
 */
export function LocalDate({
  value,
  options = { month: "short", day: "numeric" },
  placeholder = "·",
}: {
  value: string | Date | null;
  options?: Intl.DateTimeFormatOptions;
  placeholder?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (value == null) return <>—</>;
  if (!mounted) return <>{placeholder}</>;
  const d = typeof value === "string" ? new Date(value) : value;
  return <>{d.toLocaleDateString(undefined, options)}</>;
}
