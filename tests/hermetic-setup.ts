// Runs inside every test worker before tests. Forces the deterministic
// (offline) AI paths so the unit suite is hermetic — heuristic classification,
// structured search, no embeddings, no STT/Vision — regardless of what's in
// .env.local or the shell. Real-key behaviour is validated via the live smoke
// test, not here.
process.env.AI_OFFLINE = "1";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.STT_API_KEY;
// Phase 6 connectors disabled in unit tests (no live API calls); validated live.
delete process.env.TAVILY_API_KEY;
delete process.env.NOTION_API_KEY;
