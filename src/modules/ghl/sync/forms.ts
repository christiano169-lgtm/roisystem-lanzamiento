import { prisma } from '../../../db/prisma.js';
import { ghlLocationGet } from '../client.js';
import type { EntitySyncer, SyncPageResult } from './types.js';

const SUBMISSIONS_PAGE_LIMIT = 100;
const FORMS_PAGE_LIMIT = 50;

interface GhlForm {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface GhlFormsResponse {
  forms: GhlForm[];
  total: number;
}

interface GhlFormSubmission {
  id: string;
  contactId?: string;
  createdAt?: string;
  formId: string;
  [key: string]: unknown;
}

interface GhlFormSubmissionsResponse {
  submissions: GhlFormSubmission[];
  meta?: { total: number; currentPage: number; nextPage: number | null; prevPage: number | null };
}

// Confirmed against github.com/GoHighLevel/highlevel-api-docs (apps/forms.json):
// GET /forms/ lists a location's forms (skip/limit, small — used to resolve
// each submission's formId to a name for the attendance rules a launch
// defines). GET /forms/submissions paginates by page number, not an
// id-based cursor like contacts, so the cursor here is just "next page".
// Requires the `forms.readonly` scope on the Private Integration Token —
// not needed by any other sync, so it's a separate scope to ask clients for.
export const formsSyncer: EntitySyncer = {
  async syncPage(tenantId, locationId, ghlLocationId, cursor): Promise<SyncPageResult> {
    if (!cursor) {
      await syncForms(tenantId, locationId, ghlLocationId);
    }
    const page = cursor ? (JSON.parse(cursor) as number) : 1;

    const data = await ghlLocationGet<GhlFormSubmissionsResponse>(tenantId, ghlLocationId, '/forms/submissions', {
      locationId: ghlLocationId,
      limit: SUBMISSIONS_PAGE_LIMIT,
      page,
    });

    for (const submission of data.submissions) {
      await upsertFormSubmission(locationId, submission);
    }

    const nextCursor = data.meta?.nextPage ? JSON.stringify(data.meta.nextPage) : null;
    return { recordsSynced: data.submissions.length, nextCursor };
  },
};

async function syncForms(tenantId: string, locationId: string, ghlLocationId: string) {
  let skip = 0;
  for (;;) {
    const data = await ghlLocationGet<GhlFormsResponse>(tenantId, ghlLocationId, '/forms/', {
      locationId: ghlLocationId,
      limit: FORMS_PAGE_LIMIT,
      skip,
    });

    for (const form of data.forms) {
      await prisma.form.upsert({
        where: { locationId_ghlId: { locationId, ghlId: form.id } },
        create: { locationId, ghlId: form.id, name: form.name, raw: form as object },
        update: { name: form.name, raw: form as object },
      });
    }

    skip += data.forms.length;
    if (data.forms.length < FORMS_PAGE_LIMIT || skip >= data.total) break;
  }
}

async function upsertFormSubmission(locationId: string, submission: GhlFormSubmission) {
  const form = await prisma.form.findUnique({ where: { locationId_ghlId: { locationId, ghlId: submission.formId } } });
  // Submission for a form our forms list hasn't picked up yet (race between
  // the two calls above) — the next sync run re-syncs forms first and picks
  // this submission up then, rather than dropping it silently.
  if (!form) return;

  await prisma.formSubmission.upsert({
    where: { locationId_ghlId: { locationId, ghlId: submission.id } },
    create: {
      locationId,
      ghlId: submission.id,
      formId: form.id,
      contactGhlId: submission.contactId ?? null,
      submittedAt: submission.createdAt ? new Date(submission.createdAt) : null,
      raw: submission as object,
    },
    update: {
      submittedAt: submission.createdAt ? new Date(submission.createdAt) : null,
      raw: submission as object,
    },
  });
}
