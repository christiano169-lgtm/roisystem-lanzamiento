import { prisma } from '../../../db/prisma.js';
import { ghlLocationGet } from '../client.js';
import type { GhlOpportunity } from '../types.js';
import type { EntitySyncer, SyncPageResult } from './types.js';

const PAGE_LIMIT = 100;

interface GhlOpportunitiesResponse {
  opportunities: GhlOpportunity[];
  meta?: { startAfterId?: string; startAfter?: number };
}

// Confirmed against github.com/GoHighLevel/highlevel-api-docs
// (apps/opportunities.json), fetched 2026-08-03: param is `location_id`
// (snake_case, unlike every other endpoint), and the response DOES echo
// `meta.startAfterId`/`meta.startAfter` for cursor pagination — matches this
// implementation as originally written.
export const opportunitiesSyncer: EntitySyncer = {
  async syncPage(tenantId, locationId, ghlLocationId, cursor): Promise<SyncPageResult> {
    const [startAfterId, startAfter] = cursor ? (JSON.parse(cursor) as [string, number]) : [undefined, undefined];

    const data = await ghlLocationGet<GhlOpportunitiesResponse>(tenantId, ghlLocationId, '/opportunities/search', {
      location_id: ghlLocationId,
      limit: PAGE_LIMIT,
      ...(startAfterId ? { startAfterId, startAfter } : {}),
    });

    for (const opp of data.opportunities) {
      await upsertOpportunity(locationId, opp);
    }

    // See contacts.ts's matching comment — computed whenever GHL echoes a
    // cursor, not gated on a full page, so a terminal page still leaves a
    // resume point for the next full backfill instead of forcing a re-walk
    // of every opportunity from scratch each time.
    const nextCursor = data.meta?.startAfterId ? JSON.stringify([data.meta.startAfterId, data.meta.startAfter]) : null;

    return { recordsSynced: data.opportunities.length, nextCursor };
  },
};

async function upsertOpportunity(locationId: string, opp: GhlOpportunity) {
  const [contact, pipelineStage] = await Promise.all([
    opp.contactId
      ? prisma.contact.findUnique({ where: { locationId_ghlId: { locationId, ghlId: opp.contactId } } })
      : Promise.resolve(null),
    opp.pipelineId && opp.pipelineStageId
      ? prisma.pipelineStage.findUnique({
          where: {
            locationId_ghlPipelineId_ghlStageId: {
              locationId,
              ghlPipelineId: opp.pipelineId,
              ghlStageId: opp.pipelineStageId,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  return prisma.opportunity.upsert({
    where: { locationId_ghlId: { locationId, ghlId: opp.id } },
    create: {
      locationId,
      ghlId: opp.id,
      contactId: contact?.id ?? null,
      pipelineStageId: pipelineStage?.id ?? null,
      name: opp.name ?? null,
      monetaryValue: opp.monetaryValue ?? null,
      status: opp.status ?? null,
      ownerGhlId: opp.assignedTo ?? null,
      ghlCreatedAt: opp.createdAt ? new Date(opp.createdAt) : null,
      ghlUpdatedAt: opp.updatedAt ? new Date(opp.updatedAt) : null,
      raw: opp as object,
    },
    update: {
      contactId: contact?.id ?? null,
      pipelineStageId: pipelineStage?.id ?? null,
      name: opp.name ?? null,
      monetaryValue: opp.monetaryValue ?? null,
      status: opp.status ?? null,
      ownerGhlId: opp.assignedTo ?? null,
      ghlUpdatedAt: opp.updatedAt ? new Date(opp.updatedAt) : null,
      raw: opp as object,
    },
  });
}

export { upsertOpportunity };
