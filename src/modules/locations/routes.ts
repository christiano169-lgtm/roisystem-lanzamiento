import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { enqueueLocationBackfill } from '../../jobs/queue.js';
import { connectLocation, listLocations, rotateLocationToken, SAFE_LOCATION_SELECT } from './service.js';

export const locationsRouter = Router();

locationsRouter.use(requireAuth);

locationsRouter.get('/', async (req, res, next) => {
  try {
    const locations = await listLocations(req.auth!.tenantId);
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

const connectSchema = z.object({
  ghlLocationId: z.string().min(1),
  name: z.string().min(1),
  privateIntegrationToken: z.string().min(10),
});

/** Adds a new sub-account by pasting its GHL Private Integration Token (Fase 6, no OAuth). */
locationsRouter.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const input = connectSchema.parse(req.body);
    const location = await connectLocation({ tenantId: req.auth!.tenantId, ...input });
    res.status(201).json({ location });
  } catch (err) {
    next(err);
  }
});

const rotateTokenSchema = z.object({ privateIntegrationToken: z.string().min(10) });

/** Replaces a Location's token — GHL recommends rotating Private Integration Tokens periodically. */
locationsRouter.post('/:id/token', requireRole('admin'), async (req, res, next) => {
  try {
    const { privateIntegrationToken } = rotateTokenSchema.parse(req.body);
    const location = await rotateLocationToken(req.auth!.tenantId, req.params.id!, privateIntegrationToken);
    if (!location) return res.status(404).json({ error: 'Location not found' });
    res.json({ location });
  } catch (err) {
    next(err);
  }
});

const businessLineSchema = z.object({ businessLine: z.enum(['high_ticket', 'lanzamiento']) });

locationsRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { businessLine } = businessLineSchema.parse(req.body);
    const location = await prisma.location.findFirst({
      where: { id: req.params.id, tenantId: req.auth!.tenantId },
    });
    if (!location) return res.status(404).json({ error: 'Location not found' });

    const updated = await prisma.location.update({ where: { id: location.id }, data: { businessLine }, select: SAFE_LOCATION_SELECT });
    res.json({ location: updated });
  } catch (err) {
    next(err);
  }
});

/** Recent sync job history + errors for a Location — the fastest way to see why a sync failed without shell access to the server. */
locationsRouter.get('/:id/sync-jobs', async (req, res, next) => {
  try {
    const location = await prisma.location.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!location) return res.status(404).json({ error: 'Location not found' });
    const jobs = await prisma.syncJob.findMany({
      where: { locationId: location.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, entity: true, status: true, cursor: true, recordsSynced: true, error: true, startedAt: true, finishedAt: true, createdAt: true },
    });
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

// A worker crash or mid-backfill redeploy can leave syncStatus stuck at
// 'syncing' forever (runFullBackfillForLocation only clears it in its own
// try/catch, which never runs if the process dies) — treat it as stale
// past this and allow a fresh sync instead of blocking permanently.
const STALE_SYNC_MS = 45 * 60 * 1000;

/**
 * Enqueues a full backfill (pipelines, contacts, opportunities, calls,
 * appointments). Guarded against overlapping runs for the same location
 * with an atomic UPDATE ... WHERE on Location.syncStatus/syncingSince —
 * checking the SyncJob table (an earlier version of this guard) wasn't
 * enough: SyncJob rows are only created once the *worker* picks up the
 * job, so two /sync requests landing seconds apart (while the first
 * backfill is still queued, not yet started) both saw "nothing running"
 * and both enqueued. Confirmed in production 2026-08-24: every entity
 * synced in duplicate, ~15-20s apart, even after the SyncJob-based guard
 * was deployed. Flipping syncStatus synchronously in this request handler
 * (not in the worker) closes that window — Postgres serializes the UPDATE,
 * so only one of two simultaneous requests can win it.
 */
locationsRouter.post('/:id/sync', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const location = await prisma.location.findFirst({
      where: { id: req.params.id, tenantId: req.auth!.tenantId },
    });
    if (!location) return res.status(404).json({ error: 'Location not found' });

    const staleBefore = new Date(Date.now() - STALE_SYNC_MS);
    const flip = await prisma.location.updateMany({
      where: {
        id: location.id,
        OR: [{ syncStatus: { not: 'syncing' } }, { syncingSince: null }, { syncingSince: { lt: staleBefore } }],
      },
      data: { syncStatus: 'syncing', syncingSince: new Date() },
    });
    if (flip.count === 0) {
      return res.status(202).json({ message: 'Ya hay una sincronización en curso para esta subcuenta.', locationId: location.id });
    }

    await enqueueLocationBackfill({ tenantId: req.auth!.tenantId, locationId: location.id });
    res.status(202).json({ message: 'Backfill enqueued', locationId: location.id });
  } catch (err) {
    next(err);
  }
});
