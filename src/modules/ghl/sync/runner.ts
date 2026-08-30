import axios from 'axios';
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

// SyncJob.error used to store just `err.message` ("Request failed with
// status code 401") — enough to know a request failed, not why. GHL's own
// response body (e.g. a scope/auth message) is on `err.response.data` and
// was being silently dropped, which made a real permission/config problem
// indistinguishable from ordinary rate-limiting. Confirmed 2026-08-30: this
// was the missing piece needed to diagnose the conversations sync's
// persistent 401.
function describeSyncError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    const bodyStr = typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;
    return [`HTTP ${err.response?.status ?? '?'} ${err.message}`, bodyStr].filter(Boolean).join(' — ');
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Resuming point for the next full backfill of this entity — the last
 * cursor any past run (completed OR failed, doesn't matter, both represent
 * real progress) got to. Without this, every sync started at page 1 again
 * and re-walked the entire history (16k+ contacts, 8k+ conversations),
 * which is why a repeat sync took as long as the first one. Only useful
 * for "catch up on new records"; it does NOT re-check old records for
 * updates (e.g. an existing contact's tags changing) — that would need a
 * GHL webhook, which this project doesn't have for contacts/opportunities/
 * conversations (only Hotmart does).
 *
 * Scoped to contacts/opportunities/conversations — their cursors are all
 * "position in ascending-date order," which is safe to resume. Appointments
 * sweeps a fixed user×time-window grid where the terminal cursor means
 * "no more users," so resuming from it would permanently return 0 records;
 * forms paginates by page NUMBER, which shifts as new submissions arrive
 * and only re-syncs the forms list itself when cursor is null. Neither is a
 * "walk forward from a timestamp" cursor, so incremental resume doesn't
 * apply to them the same way.
 */
const RESUMABLE_ENTITIES: SyncEntity[] = ['contacts', 'opportunities', 'conversations'];

async function getResumeCursor(locationId: string, entity: SyncEntity): Promise<string | null> {
  if (!RESUMABLE_ENTITIES.includes(entity)) return null;
  const last = await prisma.syncJob.findFirst({
    where: { locationId, entity, cursor: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { cursor: true },
  });
  return last?.cursor ?? null;
}

export async function runEntitySync(tenantId: string, locationId: string, ghlLocationId: string, entity: SyncEntity) {
  const syncer = ENTITY_SYNCERS[entity];

  const job = await prisma.syncJob.create({
    data: { locationId, entity, status: 'running', startedAt: new Date() },
  });

  let cursor: string | null = await getResumeCursor(locationId, entity);
  let lastKnownCursor: string | null = cursor;
  let totalSynced = 0;

  try {
    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      const result = await syncer.syncPage(tenantId, locationId, ghlLocationId, cursor);
      totalSynced += result.recordsSynced;
      cursor = result.nextCursor ?? null;
      // Persist the last real position even once pagination ends — cursor
      // itself goes null right when we're done, which would otherwise wipe
      // out the resume point getResumeCursor() needs for next time.
      if (cursor) lastKnownCursor = cursor;

      await prisma.syncJob.update({
        where: { id: job.id },
        data: { recordsSynced: totalSynced, cursor: lastKnownCursor },
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
      data: { status: 'failed', finishedAt: new Date(), error: describeSyncError(err) },
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

    // A short breather between entities — conversations has repeatedly
    // failed on its very first request right as a large contacts/
    // opportunities sync finished in the same second, consistent with
    // GHL's rate limiter not having reset yet rather than a scope/config
    // problem (all scopes confirmed present on the token).
    for (const entity of Object.keys(ENTITY_SYNCERS) as (keyof typeof ENTITY_SYNCERS)[]) {
      await runEntitySync(tenantId, locationId, location.ghlLocationId, entity);
      await new Promise((resolve) => setTimeout(resolve, 2000));
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
