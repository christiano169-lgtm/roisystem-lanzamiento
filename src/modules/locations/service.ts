import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { encryptToken } from '../ghl/crypto.js';

// Never select ghlPitCipher into an API response — it's the encrypted
// Private Integration Token, and even ciphertext shouldn't round-trip to
// the client. Reused by every query here that a route hands back as JSON.
export const SAFE_LOCATION_SELECT = {
  id: true,
  tenantId: true,
  ghlLocationId: true,
  name: true,
  businessLine: true,
  syncStatus: true,
  lastSyncedAt: true,
  ghlPitAddedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LocationSelect;

export function listLocations(tenantId: string) {
  return prisma.location.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: SAFE_LOCATION_SELECT });
}

/**
 * Connects a Location by storing the client's own GHL Private Integration
 * Token (Fase 6 — replaced the Agency-OAuth "discover every installed
 * Location automatically" flow, since there's no Marketplace app anymore).
 * The client finds `ghlLocationId` in their GHL sub-account URL
 * (app.gohighlevel.com/location/<id>/...) and generates the token from that
 * sub-account's own Settings > Private Integrations.
 */
export async function connectLocation(input: { tenantId: string; ghlLocationId: string; name: string; privateIntegrationToken: string }) {
  return prisma.location.create({
    data: {
      tenantId: input.tenantId,
      ghlLocationId: input.ghlLocationId,
      name: input.name,
      ghlPitCipher: encryptToken(input.privateIntegrationToken),
      ghlPitAddedAt: new Date(),
    },
    select: SAFE_LOCATION_SELECT,
  });
}

/** Rotate a Location's token (GHL recommends rotating Private Integration Tokens periodically). */
export async function rotateLocationToken(tenantId: string, locationId: string, privateIntegrationToken: string) {
  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId } });
  if (!location) return null;
  return prisma.location.update({
    where: { id: location.id },
    data: { ghlPitCipher: encryptToken(privateIntegrationToken), ghlPitAddedAt: new Date() },
    select: SAFE_LOCATION_SELECT,
  });
}
