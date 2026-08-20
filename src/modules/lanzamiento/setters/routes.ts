import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { assertOwnedLocation } from '../../../lib/authz.js';
import { getSettersDetail, getSettersSummary } from './service.js';

export const settersRouter = Router();

settersRouter.use(requireAuth);

const querySchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

settersRouter.get('/summary', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const summary = await getSettersSummary(q.locationId, {
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

const detailQuerySchema = querySchema.extend({ ownerGhlId: z.string().min(1).optional() });

/** Conversation-level drill-down under the Setters table — "quién respondió, quién no, y cuándo" para una fila puntual. */
settersRouter.get('/detail', async (req, res, next) => {
  try {
    const q = detailQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const detail = await getSettersDetail(
      q.locationId,
      { from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined },
      q.ownerGhlId,
    );
    res.json({ detail });
  } catch (err) {
    next(err);
  }
});
