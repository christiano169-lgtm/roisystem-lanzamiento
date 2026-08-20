import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { assertOwnedLocation, NotFoundError } from '../../lib/authz.js';
import { ghlLocationPut } from '../ghl/client.js';

export const dataRouter = Router();

dataRouter.use(requireAuth);

const listQuerySchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const contactsQuerySchema = listQuerySchema.extend({ q: z.string().min(1).optional() });

function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

dataRouter.get('/contacts', async (req, res, next) => {
  try {
    const q = contactsQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    const where = {
      locationId: q.locationId,
      ...(q.from || q.to
        ? { ghlCreatedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
      // CRM search bar — matches the mockup's "buscador" over name/phone/email.
      ...(q.q
        ? {
            OR: [
              { firstName: { contains: q.q, mode: 'insensitive' as const } },
              { lastName: { contains: q.q, mode: 'insensitive' as const } },
              { phone: { contains: q.q, mode: 'insensitive' as const } },
              { email: { contains: q.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          opportunities: { orderBy: { ghlCreatedAt: 'desc' }, take: 1, include: { pipelineStage: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { ghlCreatedAt: 'desc' },
        ...paginate(q.page, q.pageSize),
      }),
      prisma.contact.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

/** Bandeja's "Ver conversación" action — the chat transcript for one contact, without the caller needing to know the underlying Conversation id. */
dataRouter.get('/contacts/:id/conversation', async (req, res, next) => {
  try {
    const contact = await prisma.contact.findUnique({ where: { id: req.params.id! } });
    if (!contact) throw new NotFoundError('Contact not found');
    await assertOwnedLocation(req.auth!.tenantId, contact.locationId);

    if (!contact.ghlId) return res.json({ conversation: null });

    const conversation = await prisma.conversation.findFirst({
      where: { locationId: contact.locationId, contactGhlId: contact.ghlId },
      orderBy: { lastMessageAt: 'desc' },
      include: { messages: { orderBy: { ghlCreatedAt: 'asc' } } },
    });
    res.json({ conversation });
  } catch (err) {
    next(err);
  }
});

dataRouter.get('/opportunities', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    const where = {
      locationId: q.locationId,
      ...(q.from || q.to
        ? { ghlCreatedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        include: { pipelineStage: true, contact: { select: { firstName: true, lastName: true, phone: true } } },
        orderBy: { ghlCreatedAt: 'desc' },
        ...paginate(q.page, q.pageSize),
      }),
      prisma.opportunity.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

const assignOwnerSchema = z.object({ ownerGhlId: z.string().min(1).nullable() });

/**
 * Bandeja's "Asesor" assignment — writes GHL's `assignedTo` field (same one
 * ghl/sync/contacts.ts already reads on the way in as `ownerGhlId`), then
 * mirrors locally so the queue updates without waiting for the next sync.
 */
dataRouter.patch('/contacts/:id/owner', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { ownerGhlId } = assignOwnerSchema.parse(req.body);
    const contact = await prisma.contact.findUnique({ where: { id: req.params.id! } });
    if (!contact) throw new NotFoundError('Contact not found');
    const location = await assertOwnedLocation(req.auth!.tenantId, contact.locationId);

    await ghlLocationPut(req.auth!.tenantId, location.ghlLocationId, `/contacts/${contact.ghlId}`, { assignedTo: ownerGhlId });

    const updated = await prisma.contact.update({ where: { id: contact.id }, data: { ownerGhlId } });
    res.json({ contact: updated });
  } catch (err) {
    next(err);
  }
});

/** Tag filter chips on the Panel ejecutivo — real tags synced from GHL contacts, not the fixed demo list the original mock used. */
dataRouter.get('/tags', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const tags = await prisma.tag.findMany({ where: { locationId }, orderBy: { name: 'asc' } });
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

/** Advisor name lookup for CRM board cards / stage automation pickers — see kpis/service.ts's nameByOwner map for the same pattern. */
dataRouter.get('/ghl-users', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const users = await prisma.ghlUser.findMany({ where: { locationId }, orderBy: { name: 'asc' } });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

const moveStageSchema = z.object({ pipelineStageId: z.string().min(1) });

/**
 * Manual drag/click move in the CRM board (src/routes/CrmBoard.tsx) — writes
 * to GHL first (same PUT /opportunities/:ghlId pattern the AI write-back uses
 * in quality/writeback.ts's maybeMoveStage), then mirrors locally so the
 * board and KPIs reflect the move without waiting for the next backfill.
 */
dataRouter.patch('/opportunities/:id/stage', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { pipelineStageId } = moveStageSchema.parse(req.body);

    const opportunity = await prisma.opportunity.findUnique({ where: { id: req.params.id! } });
    if (!opportunity) throw new NotFoundError('Opportunity not found');
    const location = await assertOwnedLocation(req.auth!.tenantId, opportunity.locationId);

    const targetStage = await prisma.pipelineStage.findUnique({ where: { id: pipelineStageId } });
    if (!targetStage || targetStage.locationId !== opportunity.locationId) {
      throw new NotFoundError('Pipeline stage not found for this location');
    }

    await ghlLocationPut(req.auth!.tenantId, location.ghlLocationId, `/opportunities/${opportunity.ghlId}`, {
      pipelineStageId: targetStage.ghlStageId,
    });

    const updated = await prisma.opportunity.update({
      where: { id: opportunity.id },
      data: { pipelineStageId: targetStage.id },
      include: { pipelineStage: true },
    });

    res.json({ opportunity: updated });
  } catch (err) {
    next(err);
  }
});

dataRouter.get('/calls', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    const where = {
      locationId: q.locationId,
      ...(q.from || q.to
        ? { ghlCreatedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.call.findMany({
        where,
        include: { qualityAnalysis: true },
        orderBy: { ghlCreatedAt: 'desc' },
        ...paginate(q.page, q.pageSize),
      }),
      prisma.call.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

/** "Rendimiento" tab (Videollamadas) — Fathom-synced, one row per closer meeting. */
dataRouter.get('/video-calls', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    const where = {
      locationId: q.locationId,
      ...(q.from || q.to
        ? { occurredAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.videoCall.findMany({
        where,
        include: { qualityAnalysis: true },
        orderBy: { occurredAt: 'desc' },
        ...paginate(q.page, q.pageSize),
      }),
      prisma.videoCall.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

/** "Rendimiento" tab (Chats) — GHL conversations, one row per thread. */
dataRouter.get('/conversations', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    const where = {
      locationId: q.locationId,
      ...(q.from || q.to
        ? { lastMessageAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: { qualityAnalysis: true, messages: { orderBy: { ghlCreatedAt: 'asc' }, take: 1 } },
        orderBy: { lastMessageAt: 'desc' },
        ...paginate(q.page, q.pageSize),
      }),
      prisma.conversation.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

dataRouter.get('/appointments', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    const where = {
      locationId: q.locationId,
      ...(q.from || q.to
        ? { startTime: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.appointment.findMany({ where, orderBy: { startTime: 'desc' }, ...paginate(q.page, q.pageSize) }),
      prisma.appointment.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

/** Powers the pipeline-stage picker in Settings (stage-automation rules) and any other stage dropdown. */
dataRouter.get('/pipeline-stages', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const stages = await prisma.pipelineStage.findMany({
      where: { locationId },
      orderBy: [{ pipelineName: 'asc' }, { position: 'asc' }],
    });
    res.json({ stages });
  } catch (err) {
    next(err);
  }
});

/** Lets the frontend poll backfill progress instead of guessing when data is ready. */
dataRouter.get('/sync-jobs', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const jobs = await prisma.syncJob.findMany({
      where: { locationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});
