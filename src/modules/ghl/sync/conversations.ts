import { prisma } from '../../../db/prisma.js';
import { ghlLocationGet } from '../client.js';
import { enqueueQualityAnalysis } from '../../../jobs/queue.js';
import { isCallMessage, upsertCallFromMessage } from './calls.js';
import type { GhlConversation, GhlMessage } from '../types.js';
import type { EntitySyncer, SyncPageResult } from './types.js';

const PAGE_LIMIT = 100;
// Bounds how many messages we pull per conversation on each sync pass —
// enough for the quality analyzer to read recent context without turning a
// long-running thread into an unbounded fetch.
const MESSAGES_PER_CONVERSATION = 100;

interface GhlConversationsResponse {
  conversations: GhlConversation[];
  total: number;
}

// Confirmed against a live account (2026-08-20): GET /conversations/{id}/messages
// wraps the array one level deeper than GhlConversationsResponse — the top-level
// `messages` key is an object (`{ lastMessageId, nextPage, messages: [...] }`),
// not the array itself. Easy to miss since GHL's other list endpoints
// (contacts, conversations/search) put the array at the top level.
interface GhlMessagesResponse {
  messages: {
    messages: GhlMessage[];
    lastMessageId?: string;
    nextPage?: boolean;
  };
}

// Confirmed against github.com/GoHighLevel/highlevel-api-docs
// (apps/conversations.json), fetched 2026-08-03:
// - GET /conversations/search takes `startAfterDate`, not an id-based
//   cursor, and the response has no `meta` object — only `conversations` +
//   `total`. The documented ConversationSchema also has no `dateAdded`
//   field to build that cursor from (a real gap in GHL's own docs — several
//   GHL objects carry undocumented fields in practice). We read it
//   defensively off the raw payload; if it's genuinely absent, pagination
//   stops after the first page rather than looping incorrectly.
// - GET /conversations/{id}/messages takes `lastMessageId` + `limit`
//   (confirmed, matches this implementation).
export const conversationsSyncer: EntitySyncer = {
  async syncPage(tenantId, locationId, ghlLocationId, cursor): Promise<SyncPageResult> {
    const startAfterDate = cursor ? (JSON.parse(cursor) as number) : undefined;

    const data = await ghlLocationGet<GhlConversationsResponse>(tenantId, ghlLocationId, '/conversations/search', {
      locationId: ghlLocationId,
      limit: PAGE_LIMIT,
      sort: 'asc',
      ...(startAfterDate ? { startAfterDate } : {}),
    });

    let lastDateAdded: number | undefined;
    for (const conversation of data.conversations) {
      const row = await upsertConversation(locationId, conversation);
      const { messageCount, lastMessageAt } = await syncMessages(tenantId, locationId, ghlLocationId, row.id, conversation.id);
      if (lastMessageAt) lastDateAdded = lastMessageAt;

      // One extra GHL request per conversation (~100/page) is enough to
      // trigger burst throttling that contacts/opportunities (1 request/page)
      // never hit — see ghlLocationRequest's retry/backoff comment. Spacing
      // requests out keeps the sustained rate low enough that retries are
      // rarely needed at all.
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Only worth analyzing once there's something to read; re-syncing an
      // already-analyzed conversation with no new messages would just
      // re-queue the same (deduplicated, see enqueueQualityAnalysis) job.
      if (messageCount > 0) {
        await enqueueQualityAnalysis({ tenantId, channel: 'chat', sourceId: row.id });
      }
    }

    const nextCursor = data.conversations.length === PAGE_LIMIT && lastDateAdded ? JSON.stringify(lastDateAdded) : null;

    return { recordsSynced: data.conversations.length, nextCursor };
  },
};

async function upsertConversation(locationId: string, conversation: GhlConversation) {
  return prisma.conversation.upsert({
    where: { locationId_ghlId: { locationId, ghlId: conversation.id } },
    create: {
      locationId,
      ghlId: conversation.id,
      contactGhlId: conversation.contactId ?? null,
      unreadCount: conversation.unreadCount ?? null,
      raw: conversation as object,
    },
    update: {
      unreadCount: conversation.unreadCount ?? null,
      raw: conversation as object,
    },
  });
}

/**
 * Syncs a conversation's messages, upserting a Call row for any message
 * that's actually a phone call (see sync/calls.ts), and backfills
 * Conversation.ownerGhlId / lastMessageAt from the messages themselves —
 * confirmed the Conversation object itself doesn't carry either field.
 */
async function syncMessages(
  tenantId: string,
  locationId: string,
  ghlLocationId: string,
  conversationId: string,
  ghlConversationId: string,
): Promise<{ messageCount: number; lastMessageAt: number | undefined }> {
  const data = await ghlLocationGet<GhlMessagesResponse>(
    tenantId,
    ghlLocationId,
    `/conversations/${ghlConversationId}/messages`,
    { limit: MESSAGES_PER_CONVERSATION },
  );
  const messages = data.messages?.messages ?? [];

  let lastOutboundOwner: string | null = null;
  let lastMessageAt: number | undefined;

  for (const message of messages) {
    await prisma.message.upsert({
      where: { conversationId_ghlId: { conversationId, ghlId: message.id ?? message.messageId! } },
      create: {
        conversationId,
        ghlId: message.id ?? message.messageId!,
        direction: message.direction ?? null,
        messageType: message.messageType ?? null,
        body: message.body ?? null,
        ghlCreatedAt: message.dateAdded ? new Date(message.dateAdded) : null,
        raw: message as object,
      },
      update: {
        body: message.body ?? null,
        raw: message as object,
      },
    });

    if (isCallMessage(message)) {
      await upsertCallFromMessage(tenantId, locationId, message);
    }

    if (message.dateAdded) {
      const ts = new Date(message.dateAdded).getTime();
      if (!lastMessageAt || ts > lastMessageAt) lastMessageAt = ts;
    }
    if (message.direction === 'outbound' && message.userId) {
      lastOutboundOwner = message.userId;
    }
  }

  if (lastOutboundOwner || lastMessageAt) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(lastOutboundOwner ? { ownerGhlId: lastOutboundOwner } : {}),
        ...(lastMessageAt ? { lastMessageAt: new Date(lastMessageAt) } : {}),
      },
    });
  }

  return { messageCount: messages.length, lastMessageAt };
}

export { upsertConversation };
