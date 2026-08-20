import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { assertOwnedLocation } from '../../lib/authz.js';
import { deleteFathomConnection, getFathomConnection, saveFathomConnection } from './connectionService.js';
import { enqueueFathomSync } from '../../jobs/queue.js';

export const fathomRouter = Router();

fathomRouter.use(requireAuth);

const connectSchema = z.object({
  locationId: z.string().min(1),
  apiKey: z.string().min(10),
});

/** Each closer manages their own connection — always scoped to req.auth.sub, never another user's. */
fathomRouter.post('/connection', async (req, res, next) => {
  try {
    const input = connectSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    const connection = await saveFathomConnection(req.auth!.sub, input.locationId, input.apiKey);
    res.status(201).json({ connected: true, locationId: connection.locationId });
  } catch (err) {
    next(err);
  }
});

fathomRouter.get('/connection', async (req, res, next) => {
  try {
    const connection = await getFathomConnection(req.auth!.sub);
    res.json({
      connected: !!connection,
      locationId: connection?.locationId ?? null,
      lastSyncedAt: connection?.lastSyncedAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});

fathomRouter.delete('/connection', async (req, res, next) => {
  try {
    await deleteFathomConnection(req.auth!.sub);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

fathomRouter.post('/sync', async (req, res, next) => {
  try {
    const connection = await getFathomConnection(req.auth!.sub);
    if (!connection) return res.status(400).json({ error: 'Connect a Fathom API key first' });
    await enqueueFathomSync({ tenantId: req.auth!.tenantId, fathomConnectionId: connection.id });
    res.status(202).json({ message: 'Fathom sync enqueued' });
  } catch (err) {
    next(err);
  }
});
