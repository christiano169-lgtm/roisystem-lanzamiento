import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { assertOwnedLocation } from '../../lib/authz.js';
import { deleteHotmartConnection, getHotmartConnection, saveHotmartConnection, saveHotmartWebhookHottok } from './connectionService.js';
import { getHotmartSummary } from './service.js';
import { enqueueHotmartSync } from '../../jobs/queue.js';

export const hotmartRouter = Router();

hotmartRouter.use(requireAuth);

function webhookUrlFor(locationId: string): string {
  return `${env.APP_BASE_URL}/webhooks/hotmart/${locationId}`;
}

const connectSchema = z.object({
  locationId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(10),
});

/** Agency-level asset (unlike Fathom) — admin connects one Hotmart producer account per Location. */
hotmartRouter.post('/connection', requireRole('admin'), async (req, res, next) => {
  try {
    const input = connectSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    await saveHotmartConnection(input.locationId, input.clientId, input.clientSecret);
    res.status(201).json({ connected: true });
  } catch (err) {
    next(err);
  }
});

hotmartRouter.get('/connection', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const connection = await getHotmartConnection(locationId);
    res.json({
      connected: !!connection,
      clientId: connection?.clientId ?? null,
      lastSyncedAt: connection?.lastSyncedAt ?? null,
      webhookConnected: !!connection?.webhookHottokCipher,
      webhookUrl: webhookUrlFor(locationId),
    });
  } catch (err) {
    next(err);
  }
});

const webhookSchema = z.object({ locationId: z.string().min(1), hottok: z.string().min(4) });

/** Client pastes the Hottok shown in their own Hotmart account (Ferramentas > Webhook) so real-time sales stop depending only on the polling sync. */
hotmartRouter.post('/connection/webhook', requireRole('admin'), async (req, res, next) => {
  try {
    const input = webhookSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    const connection = await getHotmartConnection(input.locationId);
    if (!connection) return res.status(400).json({ error: 'Connect a Hotmart account first' });
    await saveHotmartWebhookHottok(input.locationId, input.hottok);
    res.json({ webhookConnected: true, webhookUrl: webhookUrlFor(input.locationId) });
  } catch (err) {
    next(err);
  }
});

hotmartRouter.delete('/connection', requireRole('admin'), async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    await deleteHotmartConnection(locationId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

hotmartRouter.post('/sync', requireRole('admin'), async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.body.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const connection = await getHotmartConnection(locationId);
    if (!connection) return res.status(400).json({ error: 'Connect a Hotmart account first' });
    await enqueueHotmartSync({ tenantId: req.auth!.tenantId, locationId });
    res.status(202).json({ message: 'Hotmart sync enqueued' });
  } catch (err) {
    next(err);
  }
});

const summaryQuerySchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

hotmartRouter.get('/summary', async (req, res, next) => {
  try {
    const q = summaryQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const summary = await getHotmartSummary(q.locationId, q.from ? new Date(q.from) : undefined, q.to ? new Date(q.to) : undefined);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});
