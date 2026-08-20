import { prisma } from '../../db/prisma.js';
import { encryptToken, decryptToken } from '../ghl/crypto.js';

/** Reuses the same AES-256-GCM helper as GHL/Fathom/Meta Ads credentials (src/modules/ghl/crypto.ts). */
export async function saveHotmartConnection(locationId: string, clientId: string, clientSecret: string) {
  return prisma.hotmartConnection.upsert({
    where: { locationId },
    create: { locationId, clientId, clientSecretCipher: encryptToken(clientSecret) },
    update: { clientId, clientSecretCipher: encryptToken(clientSecret) },
  });
}

export async function saveHotmartWebhookHottok(locationId: string, hottok: string) {
  return prisma.hotmartConnection.update({
    where: { locationId },
    data: { webhookHottokCipher: encryptToken(hottok) },
  });
}

export function getHotmartConnection(locationId: string) {
  return prisma.hotmartConnection.findUnique({ where: { locationId } });
}

export async function getHotmartCredentials(locationId: string): Promise<{ clientId: string; clientSecret: string }> {
  const connection = await prisma.hotmartConnection.findUniqueOrThrow({ where: { locationId } });
  return { clientId: connection.clientId, clientSecret: decryptToken(connection.clientSecretCipher) };
}

/** Looks up a Location by its webhook Hottok — used by the webhook receiver, which gets no other tenant identity from Hotmart's payload. */
export async function findLocationIdByWebhookHottok(locationId: string, hottok: string): Promise<boolean> {
  const connection = await prisma.hotmartConnection.findUnique({ where: { locationId } });
  if (!connection?.webhookHottokCipher) return false;
  return decryptToken(connection.webhookHottokCipher) === hottok;
}

export async function deleteHotmartConnection(locationId: string) {
  await prisma.hotmartConnection.deleteMany({ where: { locationId } });
}
