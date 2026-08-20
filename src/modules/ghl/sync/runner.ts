import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../config/logger.js';
import type { SyncEntity } from '@prisma/client';
import { contactsSyncer } from './contacts.js';
import { opportunitiesSyncer } from './opportunities.js';
import { appointmentsSyncer } from './appointments.js';
import { conversationsSyncer } from './conversations.js';
import { formsSyncer } from './forms.js';
import { syncPipelineStages } from './pipelines.js';
import { syncGhlUsers } from './users.js';
import type { EntitySyncer } from './types.js';

// 'calls' isn't listed: Call rows are populated as a side effect of the
// `conversations` syncer (GHL has no standalone calls endpoint — see
// sync/calls.ts), not independently backfilled.
const ENTITY_SYNCERS: Record<SyncEntity, EntitySyncer> = {
  contacts: contactsSyncer,
  opportunities: opportunitiesSyncer,
  appointments: appointmentsSyncer,
  conversations: conversationsSyncer,
  formSubmissions: formsSyncer,
};

// Hard cap so a runaway pagination bug (e.g. a cursor that never advances)
// can't loop forever and burn through GHL's rate limit.
const MAX_PAGES_PER_RUN = 2000;

export async function runEntitySync(tenantId: string, locationId: string, ghlLocationId: string, entity: SyncEntity) {
  const syncer = ENTITY_SYNCERS[entity];

  const job = await prisma.syncJob.create({
    data: { locationId, entity, status: 'running', startedAt: new Date() },
  });

  let cursor: string | null = null;
  let totalSynced = 0;

  try {
    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      const result = await syncer.syncPage(tenantId, locationId, ghlLocationId, cursor);
      totalSynced += result.recordsSynced;
      cursor = result.nextCursor ?? null;

      await prisma.syncJob.update({
        where: { id: job.id },
        data: { recordsSynced: totalSynced, cursor },
      });

      if (!cursor) break;
    }

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: 'completed', finishedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, locationId, entity }, 'Entity sync failed');
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: 'failed', finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  return totalSynced;
}

/** Full backfill for a single Location: pipelines first, then every entity. */
export async function runFullBackfillForLocation(tenantId: string, locationId: string) {
  const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
  await prisma.location.update({ where: { id: locationId }, data: { syncStatus: 'syncing' } });

  try {
    await syncPipelineStages(tenantId, locationId, location.ghlLocationId);
    await syncGhlUsers(tenantId, locationId, location.ghlLocationId);

    for (const entity of Object.keys(ENTITY_SYNCERS) as (keyof typeof ENTITY_SYNCERS)[]) {
      await runEntitySync(tenantId, locationId, location.ghlLocationId, entity);
    }

    await prisma.location.update({
      where: { id: locationId },
      data: { syncStatus: 'synced', lastSyncedAt: new Date() },
    });
  } catch (err) {
    await prisma.location.update({ where: { id: locationId }, data: { syncStatus: 'error' } });
    throw err;
  }
}
