import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { enqueueQualityAnalysis } from '../../jobs/queue.js';
import { upsertContact } from './sync/contacts.js';
import { upsertOpportunity } from './sync/opportunities.js';
import { isCallMessage, upsertCallFromMessage } from './sync/calls.js';
import { upsertAppointment } from './sync/appointments.js';
import { upsertConversation } from './sync/conversations.js';
import type { GhlAppointment, GhlContact, GhlConversation, GhlMessage, GhlOpportunity } from './types.js';

/**
 * NOTE (Fase 6): this endpoint's event shape/names (`ContactCreate`,
 * `InboundMessage`, etc.) were confirmed against GHL's *Marketplace app*
 * webhook subscriptions — which no longer apply now that GHL connections
 * are Private Integration Tokens, not an installed Marketplace app (see
 * README "Conexión con GHL"). PITs don't get automatic webhook
 * subscriptions; the closest equivalent is the client building a GHL
 * Workflow with a "Webhook" action pointing here, whose payload shape is
 * whatever that Workflow sends (configurable per-client), not guaranteed to
 * match `GhlWebhookPayload`/`routeWebhook` below. Left in place as a
 * best-effort receiver — treat `npm run worker`'s periodic backfill
 * ("Sincronizar ahora") as the reliable sync path, not this endpoint.
 */
export const ghlWebhookRouter = Router();

interface GhlWebhookPayload {
  type: string;
  locationId: string;
  [key: string]: unknown;
}

/**
 * Verifies the shared-secret HMAC signature GHL sends (if the app is
 * configured with a webhook secret). If GHL_WEBHOOK_SECRET is unset we skip
 * verification and log a warning — fine for local development against a
 * sandbox, NOT for production. Confirm the exact header name / scheme GHL
 * uses for this app (signature scheme has varied by product) before launch.
 * `secret` defaults to the real env var; overridable for tests so the logic
 * doesn't need env-stubbing to exercise both branches.
 */
export function isSignatureValid(rawBody: string, signatureHeader: string | undefined, secret = env.GHL_WEBHOOK_SECRET): boolean {
  if (!secret) {
    logger.warn('GHL_WEBHOOK_SECRET not set — skipping webhook signature verification');
    return true;
  }
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signatureHeader, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

ghlWebhookRouter.post('/', async (req, res) => {
  const rawBody: string = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const signature = req.header('x-wh-signature') ?? req.header('x-ghl-signature');

  if (!isSignatureValid(rawBody, signature)) {
    logger.warn('Rejected GHL webhook with invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body as GhlWebhookPayload;

  // Always 200 once the signature is valid: GHL retries aggressively on
  // non-2xx, and an unknown location (app just uninstalled, race with the
  // location list refresh, etc.) shouldn't trigger retry storms.
  const location = await prisma.location.findFirst({ where: { ghlLocationId: payload.locationId } });
  if (!location) {
    logger.warn({ ghlLocationId: payload.locationId, type: payload.type }, 'Webhook for unknown location, ignoring');
    return res.status(200).json({ ignored: true });
  }

  try {
    await routeWebhook(location.tenantId, location.id, payload);
  } catch (err) {
    logger.error({ err, type: payload.type, locationId: location.id }, 'Failed to process GHL webhook');
    // Still 200: we logged it, and GHL retries won't fix a mapping bug.
  }

  res.status(200).json({ received: true });
});

async function routeWebhook(tenantId: string, locationId: string, payload: GhlWebhookPayload) {
  switch (payload.type) {
    case 'ContactCreate':
    case 'ContactUpdate':
      await upsertContact(locationId, payload as unknown as GhlContact);
      break;
    case 'OpportunityCreate':
    case 'OpportunityUpdate':
    case 'OpportunityStageUpdate':
    case 'OpportunityStatusUpdate':
      await upsertOpportunity(locationId, payload as unknown as GhlOpportunity);
      break;
    case 'AppointmentCreate':
    case 'AppointmentUpdate':
      await upsertAppointment(locationId, payload as unknown as GhlAppointment);
      break;
    // Confirmed event name against docs/webhook events/ConversationUnreadWebhook.md
    // (github.com/GoHighLevel/highlevel-api-docs, fetched 2026-08-03) — there
    // is no 'ConversationUpdate' event.
    case 'ConversationUnreadWebhook':
      await upsertConversation(locationId, payload as unknown as GhlConversation);
      break;
    // Confirmed: GHL has no CallCreate/CallUpdate event — a phone call
    // arrives as an InboundMessage/OutboundMessage with messageType 'CALL'
    // (see docs/webhook events/InboundMessage.md), same as any chat message.
    case 'InboundMessage':
    case 'OutboundMessage':
      await routeMessageWebhook(tenantId, locationId, payload as unknown as GhlMessage & { conversationId: string; contactId?: string });
      break;
    default:
      logger.info({ type: payload.type }, 'Unhandled GHL webhook type');
  }
}

async function routeMessageWebhook(
  tenantId: string,
  locationId: string,
  message: GhlMessage & { conversationId: string; contactId?: string },
) {
  // The webhook payload doesn't include the full Conversation object, so
  // make sure a row exists before attaching the message to it (the
  // paginated sync will fill in the rest on its next pass).
  const conversation = await upsertConversation(locationId, { id: message.conversationId, contactId: message.contactId });

  const ghlId = message.id ?? message.messageId!;
  await prisma.message.upsert({
    where: { conversationId_ghlId: { conversationId: conversation.id, ghlId } },
    create: {
      conversationId: conversation.id,
      ghlId,
      direction: message.direction ?? null,
      messageType: message.messageType ?? null,
      body: message.body ?? null,
      ghlCreatedAt: message.dateAdded ? new Date(message.dateAdded) : null,
      raw: message as object,
    },
    update: { body: message.body ?? null, raw: message as object },
  });

  if (isCallMessage(message)) {
    await upsertCallFromMessage(tenantId, locationId, message);
  } else {
    await enqueueQualityAnalysis({ tenantId, channel: 'chat', sourceId: conversation.id });
  }
}
