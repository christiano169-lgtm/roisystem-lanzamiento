import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { assertOwnedLocation } from '../../../lib/authz.js';
import { getSettersSummary } from './service.js';

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
