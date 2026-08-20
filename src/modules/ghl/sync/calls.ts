import { prisma } from '../../../db/prisma.js';
import { enqueueCallTranscription } from '../../../jobs/queue.js';
import type { GhlMessage } from '../types.js';

// Confirmed against github.com/GoHighLevel/highlevel-api-docs, fetched
// 2026-08-03: GHL has no standalone /calls/ resource or CallCreate/CallUpdate
// webhook — call activity is a Message whose `messageType` is one of these
// (REST API uses the 'TYPE_*' enum; the raw webhook payload uses bare
// 'CALL'). There is no dedicated `/calls/` sync entity anymore — Call rows
// are upserted as a side effect of syncing Conversations/Messages
// (sync/conversations.ts) and of the InboundMessage/OutboundMessage
// webhooks (../webhooks.ts).
export const CALL_MESSAGE_TYPES = new Set([
  'CALL',
  'TYPE_CALL',
  'TYPE_CAMPAIGN_CALL',
  'TYPE_CAMPAIGN_MANUAL_CALL',
  'TYPE_IVR_CALL',
  'TYPE_CUSTOM_CALL',
]);

export function isCallMessage(message: GhlMessage): boolean {
  return !!message.messageType && CALL_MESSAGE_TYPES.has(message.messageType);
}

/** Upserts a Call row from a call-type Message, enqueuing transcription once (see calls.ts sibling logic in Fase 3). */
export async function upsertCallFromMessage(tenantId: string, locationId: string, message: GhlMessage) {
  const ghlId = message.id || message.messageId;
  if (!ghlId) return null;

  const recordingUrl = message.attachments?.[0] ?? null;
  const existing = await prisma.call.findUnique({ where: { locationId_ghlId: { locationId, ghlId } } });
  const hadRecordingAlready = !!existing?.recordingUrl;

  const row = await prisma.call.upsert({
    where: { locationId_ghlId: { locationId, ghlId } },
    create: {
      locationId,
      ghlId,
      contactGhlId: message.contactId ?? null,
      ownerGhlId: message.userId ?? null,
      direction: message.direction ?? null,
      status: message.callStatus ?? message.status ?? null,
      durationSeconds: message.callDuration ?? null,
      recordingUrl,
      transcriptStatus: recordingUrl ? 'pending' : 'not_applicable',
      ghlCreatedAt: message.dateAdded ? new Date(message.dateAdded) : null,
      raw: message as object,
    },
    update: {
      status: message.callStatus ?? message.status ?? null,
      durationSeconds: message.callDuration ?? null,
      recordingUrl,
      raw: message as object,
    },
  });

  if (recordingUrl && !hadRecordingAlready) {
    await enqueueCallTranscription({ tenantId, callId: row.id });
  }

  return row;
}
