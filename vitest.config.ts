import { config as dotenv } from "dotenv";
// Load local env BEFORE tests so DB clients pick up the app/admin URLs.
dotenv({ path: ".env.local" });
dotenv();

// Keep the suite hermetic: strip AI provider keys so unit tests exercise the
// deterministic paths (heuristic classification, structured search, no-op
// embeddings). Real-key behaviour (LLM classify, STT, Vision, vector search)
// is validated by the live smoke test against the running server.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.STT_API_KEY;

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/hermetic-setup.ts"],
    // DB-backed tests share one database — run files sequentially.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      MIGRATE_DATABASE_URL: process.env.MIGRATE_DATABASE_URL ?? "",
      // Force the deterministic (offline) AI paths so the suite is hermetic.
      AI_OFFLINE: "1",
      // Fixed key so connector-token encryption tests are deterministic.
      TOKEN_ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
