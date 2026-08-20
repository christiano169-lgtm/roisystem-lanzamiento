import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { assertOwnedLocation } from '../../lib/authz.js';
import { getObjectionsBreakdown, getQualityDetailForCloser, getQualitySummary } from './service.js';
import { getImprovementThemes } from './themes.js';

export const qualityRouter = Router();

qualityRouter.use(requireAuth);

const querySchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  channel: z.enum(['call', 'video_call', 'chat']).optional(),
});

function toFilters(q: z.infer<typeof querySchema>) {
  return {
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    channel: q.channel,
  };
}

/** Manager-facing rollup: per-closer call/video-call/chat quality, across whichever channel(s) are requested. */
qualityRouter.get('/summary', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const summary = await getQualitySummary(q.locationId, toFilters(q));
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

// Cross-closer pattern synthesis (LLM call) — meant to be triggered on
// demand from the UI, not on every filter change like /summary.
qualityRouter.get('/themes', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const themes = await getImprovementThemes(req.auth!.tenantId, q.locationId, toFilters(q));
    res.json({ themes });
  } catch (err) {
    next(err);
  }
});

/** Powers the "Objeciones más comunes" donut/list on the Dashboard — counts by fixed category (see prisma ObjectionCategory). */
qualityRouter.get('/objections', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const breakdown = await getObjectionsBreakdown(q.locationId, toFilters(q));
    res.json({ breakdown });
  } catch (err) {
    next(err);
  }
});

qualityRouter.get('/closer/:ownerGhlId', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const analyses = await getQualityDetailForCloser(q.locationId, req.params.ownerGhlId, toFilters(q));
    res.json({ analyses });
  } catch (err) {
    next(err);
  }
});
