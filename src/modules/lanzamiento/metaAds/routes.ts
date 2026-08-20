import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { assertOwnedLocation } from '../../../lib/authz.js';
import { deleteMetaAdsConnection, getMetaAdsConnection, saveMetaAdsConnection } from './connectionService.js';
import { getMetaAdsSummary } from './service.js';
import { enqueueMetaAdsSync } from '../../../jobs/queue.js';

export const metaAdsRouter = Router();

metaAdsRouter.use(requireAuth);

const connectSchema = z.object({
  locationId: z.string().min(1),
  adAccountId: z.string().min(1),
  accessToken: z.string().min(10),
});

/** Agency-level asset (unlike Fathom) — admin connects one ad account per Location. */
metaAdsRouter.post('/connection', requireRole('admin'), async (req, res, next) => {
  try {
    const input = connectSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    await saveMetaAdsConnection(input.locationId, input.adAccountId, input.accessToken);
    res.status(201).json({ connected: true });
  } catch (err) {
    next(err);
  }
});

metaAdsRouter.get('/connection', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const connection = await getMetaAdsConnection(locationId);
    res.json({ connected: !!connection, adAccountId: connection?.adAccountId ?? null, lastSyncedAt: connection?.lastSyncedAt ?? null });
  } catch (err) {
    next(err);
  }
});

metaAdsRouter.delete('/connection', requireRole('admin'), async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    await deleteMetaAdsConnection(locationId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

metaAdsRouter.post('/sync', requireRole('admin'), async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.body.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const connection = await getMetaAdsConnection(locationId);
    if (!connection) return res.status(400).json({ error: 'Connect a Meta Ads account first' });
    await enqueueMetaAdsSync({ tenantId: req.auth!.tenantId, locationId });
    res.status(202).json({ message: 'Meta Ads sync enqueued' });
  } catch (err) {
    next(err);
  }
});

const summaryQuerySchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

metaAdsRouter.get('/summary', async (req, res, next) => {
  try {
    const q = summaryQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const summary = await getMetaAdsSummary(q.locationId, q.from ? new Date(q.from) : undefined, q.to ? new Date(q.to) : undefined);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});
