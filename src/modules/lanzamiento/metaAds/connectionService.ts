import { prisma } from '../../../db/prisma.js';
import { encryptToken, decryptToken } from '../../ghl/crypto.js';

/** Reuses the same AES-256-GCM helper as GHL/Fathom credentials (src/modules/ghl/crypto.ts). */
export async function saveMetaAdsConnection(locationId: string, adAccountId: string, accessToken: string) {
  return prisma.metaAdsConnection.upsert({
    where: { locationId },
    create: { locationId, adAccountId, accessTokenCipher: encryptToken(accessToken) },
    update: { adAccountId, accessTokenCipher: encryptToken(accessToken) },
  });
}

export function getMetaAdsConnection(locationId: string) {
  return prisma.metaAdsConnection.findUnique({ where: { locationId } });
}

export async function getMetaAdsAccessToken(locationId: string): Promise<{ adAccountId: string; accessToken: string }> {
  const connection = await prisma.metaAdsConnection.findUniqueOrThrow({ where: { locationId } });
  return { adAccountId: connection.adAccountId, accessToken: decryptToken(connection.accessTokenCipher) };
}

export async function deleteMetaAdsConnection(locationId: string) {
  await prisma.metaAdsConnection.deleteMany({ where: { locationId } });
}
