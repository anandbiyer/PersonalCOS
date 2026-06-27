import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptionEnabled } from "@/lib/crypto";
import { assertNotOffice } from "@/lib/connectors/policy";
import { tavilyEnabled } from "@/lib/connectors/tavily";
import { notionEnabled } from "@/lib/connectors/notion";

/** Phase 6 — encryption + connector scope policy (NFR-8). */
describe("[P6] token encryption", () => {
  it("round-trips and is non-deterministic (T-FR34-04)", () => {
    expect(encryptionEnabled()).toBe(true);
    const secret = "rh-access-token-xyz";
    const a = encrypt(secret);
    const b = encrypt(secret);
    expect(a).not.toBe(b); // random IV
    expect(decrypt(a)).toBe(secret);
    expect(decrypt(b)).toBe(secret);
  });

  it("rejects tampered ciphertext (T-FR34-05)", () => {
    const enc = encrypt("important");
    const tampered = enc.slice(0, -4) + (enc.endsWith("A") ? "B" : "A") + "==";
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("[P6] connector scope policy (NFR-8)", () => {
  it("refuses office content to cloud connectors (T-NFR8-01)", () => {
    expect(() => assertNotOffice("office", "Tavily")).toThrow();
    expect(() => assertNotOffice("personal_dev", "Notion")).not.toThrow();
    expect(() => assertNotOffice("personal_life", "Tavily")).not.toThrow();
  });

  it("connectors are disabled in the hermetic env (T-NFR8-02)", () => {
    expect(tavilyEnabled()).toBe(false);
    expect(notionEnabled()).toBe(false);
  });
});
