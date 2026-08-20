import { prisma } from '../db/prisma.js';

export class NotFoundError extends Error {
  status = 404;
}

/**
 * Confirms `locationId` belongs to the caller's tenant before any query
 * touches it. Shared by every module that scopes reads/writes to a single
 * Location (data, kpis, payments) so tenant isolation lives in one place.
 */
export async function assertOwnedLocation(tenantId: string, locationId: string) {
  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId } });
  if (!location) {
    throw new NotFoundError('Location not found for this tenant');
  }
  return location;
}
