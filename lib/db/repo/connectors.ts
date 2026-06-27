import { and, eq } from "drizzle-orm";
import { withOwner } from "@/lib/db";
import { connectorTokens, connectorProvider, audit } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";

export type ConnectorProvider = (typeof connectorProvider.enumValues)[number];

export interface SaveTokenInput {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
}

export interface StoredToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string | null;
  status: string;
}

/** Save (encrypt) a per-user connector token, replacing any existing one. */
export async function saveToken(
  ownerId: string,
  provider: ConnectorProvider,
  input: SaveTokenInput,
) {
  return withOwner(ownerId, async (tx) => {
    await tx
      .delete(connectorTokens)
      .where(and(eq(connectorTokens.ownerId, ownerId), eq(connectorTokens.provider, provider)));
    const [row] = await tx
      .insert(connectorTokens)
      .values({
        ownerId,
        provider,
        accessTokenEnc: encrypt(input.accessToken),
        refreshTokenEnc: input.refreshToken ? encrypt(input.refreshToken) : null,
        expiresAt: input.expiresAt ?? null,
        scopes: input.scopes ?? null,
        status: "connected",
      })
      .returning({ id: connectorTokens.id });
    await tx.insert(audit).values({
      ownerId,
      changeType: "connector.connected",
      newValue: { provider },
    });
    return row.id;
  });
}

export async function getToken(
  ownerId: string,
  provider: ConnectorProvider,
): Promise<StoredToken | null> {
  return withOwner(ownerId, async (tx) => {
    const [row] = await tx
      .select()
      .from(connectorTokens)
      .where(and(eq(connectorTokens.ownerId, ownerId), eq(connectorTokens.provider, provider)));
    if (!row) return null;
    return {
      accessToken: decrypt(row.accessTokenEnc),
      refreshToken: row.refreshTokenEnc ? decrypt(row.refreshTokenEnc) : null,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      status: row.status,
    };
  });
}

export async function deleteToken(ownerId: string, provider: ConnectorProvider) {
  return withOwner(ownerId, async (tx) => {
    await tx
      .delete(connectorTokens)
      .where(and(eq(connectorTokens.ownerId, ownerId), eq(connectorTokens.provider, provider)));
  });
}

export async function hasToken(ownerId: string, provider: ConnectorProvider): Promise<boolean> {
  return (await getToken(ownerId, provider)) !== null;
}
