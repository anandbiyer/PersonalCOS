import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 0 scaffold: keep type-checking strict in builds, but don't let
  // lint config quirks block the initial scaffold build. Re-enable in CI (Phase 1+).
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // server actions / RSC defaults are fine; nothing custom yet.
  },
};

export default nextConfig;
