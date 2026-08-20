import { prisma } from '../../db/prisma.js';
import { encryptToken, decryptToken } from '../ghl/crypto.js';

/**
 * Fathom connections reuse the exact same AES-256-GCM helper as GHL tokens
 * (src/modules/ghl/crypto.ts, keyed by TOKEN_ENCRYPTION_KEY) — confirmed
 * with the user as the intended approach, rather than introducing a second
 * secret to provision and rotate.
 */
export async function saveFathomConnection(userId: string, locationId: string, apiKey: string) {
  return prisma.fathomConnection.upsert({
    where: { userId },
    create: { userId, locationId, apiKeyCipher: encryptToken(apiKey) },
    update: { locationId, apiKeyCipher: encryptToken(apiKey) },
  });
}

export async function getFathomConnection(userId: string) {
  return prisma.fathomConnection.findUnique({ where: { userId } });
}

export async function getFathomApiKey(userId: string): Promise<string> {
  const connection = await prisma.fathomConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error(`User ${userId} has no Fathom connection`);
  }
  return decryptToken(connection.apiKeyCipher);
}

export async function deleteFathomConnection(userId: string) {
  await prisma.fathomConnection.deleteMany({ where: { userId } });
}
