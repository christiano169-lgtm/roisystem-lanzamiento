import { prisma } from '../../../db/prisma.js';
import { ghlLocationGet } from '../client.js';
import type { GhlContact } from '../types.js';
import type { EntitySyncer, SyncPageResult } from './types.js';

const PAGE_LIMIT = 100;

interface GhlContactsResponse {
  contacts: GhlContact[];
  count: number;
}

// Confirmed against github.com/GoHighLevel/highlevel-api-docs
// (apps/contacts.json), fetched 2026-08-03: GET /contacts/ takes
// `startAfterId` + `startAfter` (ms timestamp), but — unlike opportunities —
// the response has NO `meta` object echoing them back. Per GHL's documented
// convention for this endpoint, the client derives the next cursor from the
// last record returned: its own `id` + `dateAdded` (as epoch ms).
export const contactsSyncer: EntitySyncer = {
  async syncPage(tenantId, locationId, ghlLocationId, cursor): Promise<SyncPageResult> {
    const [startAfterId, startAfter] = cursor ? (JSON.parse(cursor) as [string, number]) : [undefined, undefined];

    const data = await ghlLocationGet<GhlContactsResponse>(tenantId, ghlLocationId, '/contacts/', {
      locationId: ghlLocationId,
      limit: PAGE_LIMIT,
      ...(startAfterId ? { startAfterId, startAfter } : {}),
    });

    for (const contact of data.contacts) {
      await upsertContact(locationId, contact);
    }

    const last = data.contacts[data.contacts.length - 1];
    const nextCursor =
      data.contacts.length === PAGE_LIMIT && last?.dateAdded ? JSON.stringify([last.id, new Date(last.dateAdded).getTime()]) : null;

    return { recordsSynced: data.contacts.length, nextCursor };
  },
};

async function upsertContact(locationId: string, contact: GhlContact) {
  const row = await prisma.contact.upsert({
    where: { locationId_ghlId: { locationId, ghlId: contact.id } },
    create: {
      locationId,
      ghlId: contact.id,
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      ownerGhlId: contact.assignedTo ?? null,
      source: contact.source ?? null,
      ghlCreatedAt: contact.dateAdded ? new Date(contact.dateAdded) : null,
      ghlUpdatedAt: contact.dateUpdated ? new Date(contact.dateUpdated) : null,
      raw: contact as object,
    },
    update: {
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      ownerGhlId: contact.assignedTo ?? null,
      source: contact.source ?? null,
      ghlUpdatedAt: contact.dateUpdated ? new Date(contact.dateUpdated) : null,
      raw: contact as object,
    },
  });

  if (contact.tags?.length) {
    await syncContactTags(locationId, row.id, contact.tags);
  }
  return row;
}

async function syncContactTags(locationId: string, contactId: string, tagNames: string[]) {
  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { locationId_name: { locationId, name } },
      create: { locationId, name },
      update: {},
    });
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      create: { contactId, tagId: tag.id },
      update: {},
    });
  }
}

// Exported for the webhook handler, which upserts a single contact without
// going through the paginated backfill path.
export { upsertContact };
