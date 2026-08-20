import { prisma } from '../../../db/prisma.js';
import { ghlLocationGet } from '../client.js';
import type { GhlUser } from '../types.js';

interface GhlUsersResponse {
  users: GhlUser[];
  count: number;
}

// Confirmed against github.com/GoHighLevel/highlevel-api-docs
// (apps/users.json + docs/oauth/Scopes.md), fetched 2026-08-03: GET /users/
// takes a required `locationId` and is valid at both Sub-Account and Agency
// scope — this implementation was already correct, just switched to the
// per-Location token for consistency with the rest of the sync modules.
// Team rosters are small and low-churn, so this is a full sync, no
// pagination or SyncJob bookkeeping (mirrors syncPipelineStages).
export async function syncGhlUsers(tenantId: string, locationId: string, ghlLocationId: string) {
  const { users } = await ghlLocationGet<GhlUsersResponse>(tenantId, ghlLocationId, '/users/', { locationId: ghlLocationId });

  for (const user of users) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const name = user.name ?? (fullName || user.email || user.id);
    await prisma.ghlUser.upsert({
      where: { locationId_ghlUserId: { locationId, ghlUserId: user.id } },
      create: {
        locationId,
        ghlUserId: user.id,
        name,
        email: user.email ?? null,
        raw: user as object,
      },
      update: {
        name,
        email: user.email ?? null,
        raw: user as object,
      },
    });
  }

  return users.length;
}
