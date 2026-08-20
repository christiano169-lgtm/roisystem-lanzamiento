import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { assertOwnedLocation } from '../../lib/authz.js';
import {
  getAcquisitionBySource,
  getAdvisorPanel,
  getDailyVolume,
  getFunnel,
  getMultiLocationOperationalKpis,
  getOperationalKpis,
  getRankingByAdvisor,
} from './service.js';
import type { KpiFilters } from './types.js';

export const kpisRouter = Router();

kpisRouter.use(requireAuth);

const baseQuerySchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  ownerGhlId: z.string().optional(),
  // Comma-separated tag names, e.g. ?tags=caliente,high_ticket
  tags: z.string().optional(),
});

function toFilters(q: z.infer<typeof baseQuerySchema>): KpiFilters {
  return {
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    ownerGhlId: q.ownerGhlId,
    tagNames: q.tags ? q.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
  };
}

const multiQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Agency-wide rollup across every Location the tenant owns — no locationId,
// scoped implicitly by req.auth.tenantId (see getMultiLocationOperationalKpis).
kpisRouter.get('/operational-multi', async (req, res, next) => {
  try {
    const q = multiQuerySchema.parse(req.query);
    const filters: KpiFilters = { from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined };
    const result = await getMultiLocationOperationalKpis(req.auth!.tenantId, filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/operational', async (req, res, next) => {
  try {
    const q = baseQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const kpis = await getOperationalKpis(req.auth!.tenantId, q.locationId, toFilters(q));
    res.json(kpis);
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/volume', async (req, res, next) => {
  try {
    const q = baseQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const days = await getDailyVolume(q.locationId, toFilters(q));
    res.json({ days });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/funnel', async (req, res, next) => {
  try {
    const q = baseQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const stages = await getFunnel(req.auth!.tenantId, q.locationId, toFilters(q));
    res.json({ stages });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/ranking', async (req, res, next) => {
  try {
    const q = baseQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const ranking = await getRankingByAdvisor(req.auth!.tenantId, q.locationId, toFilters(q));
    res.json({ ranking });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/acquisition', async (req, res, next) => {
  try {
    const q = baseQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const rows = await getAcquisitionBySource(req.auth!.tenantId, q.locationId, toFilters(q));
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

const advisorQuerySchema = baseQuerySchema.extend({ ownerGhlId: z.string().min(1) });

kpisRouter.get('/advisor', async (req, res, next) => {
  try {
    const q = advisorQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const filters = toFilters(q);
    const panel = await getAdvisorPanel(req.auth!.tenantId, q.locationId, q.ownerGhlId, filters);
    res.json(panel);
  } catch (err) {
    next(err);
  }
});
