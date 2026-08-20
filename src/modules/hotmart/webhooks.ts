import { Router } from 'express';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { findLocationIdByWebhookHottok } from './connectionService.js';
import { upsertHotmartSale, type HotmartSaleItem } from './sync/sales.js';

/**
 * NOTE: confirmed against Hotmart's own help center that the "Hottok" shown
 * in a client's account (Ferramentas > Webhook) is the mechanism to
 * authenticate an incoming webhook, but the exact payload shape below
 * (`event` + `data.product`/`data.buyer`/`data.purchase`) is reconstructed
 * from third-party integration examples, NOT fetched from a live Hotmart
 * payload — same "best-effort, verify against a real account" caveat this
 * project already carries for the Fathom and GHL integrations. `data` is
 * assumed to match `/sales/history`'s per-item shape (product/buyer/purchase)
 * closely enough to reuse `upsertHotmartSale` — confirm field names once a
 * real client's webhook fires and adjust HotmartSaleItem if they differ.
 *
 * Hotmart's webhook URL carries no per-tenant identity on its own (unlike
 * GHL's payload, which includes `locationId`), so each client's Hotmart
 * account points at its own URL: POST /webhooks/hotmart/:locationId — the
 * `:locationId` segment says which Location to attribute the sale to, and
 * the body's `hottok` field (checked against what the client pasted into
 * Configuración → Hotmart) proves the request is genuinely theirs.
 */
export const hotmartWebhookRouter = Router();

interface HotmartWebhookPayload {
  event?: string;
  hottok?: string;
  data?: HotmartSaleItem;
  [key: string]: unknown;
}

const SALE_EVENTS = new Set([
  'PURCHASE_APPROVED',
  'PURCHASE_COMPLETE',
  'PURCHASE_CANCELED',
  'PURCHASE_REFUNDED',
  'PURCHASE_CHARGEBACK',
  'PURCHASE_BILLET_PRINTED',
  'PURCHASE_PROTEST',
  'PURCHASE_DELAYED',
]);

hotmartWebhookRouter.post('/:locationId', async (req, res) => {
  const { locationId } = req.params;
  const payload = req.body as HotmartWebhookPayload;

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    // 200, not 404: Hotmart retries aggressively on non-2xx, and a
    // deleted/renamed Location shouldn't trigger a retry storm.
    logger.warn({ locationId }, 'Hotmart webhook for unknown location, ignoring');
    return res.status(200).json({ ignored: true });
  }

  const valid = payload.hottok ? await findLocationIdByWebhookHottok(locationId, payload.hottok) : false;
  if (!valid) {
    logger.warn({ locationId }, 'Rejected Hotmart webhook with invalid or missing hottok');
    return res.status(401).json({ error: 'Invalid hottok' });
  }

  if (payload.event && SALE_EVENTS.has(payload.event) && payload.data) {
    await upsertHotmartSale(locationId, payload.data);
  } else {
    logger.info({ event: payload.event, locationId }, 'Unhandled or dataless Hotmart webhook event');
  }

  res.status(200).json({ received: true });
});
