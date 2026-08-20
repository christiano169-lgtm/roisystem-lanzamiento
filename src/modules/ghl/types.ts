// Minimal shapes for the GHL (LeadConnector) API responses we rely on.
// Extend as new fields are actually needed — everything else stays available
// via the `raw` jsonb column on each synced model, so undermodeling here is
// deliberately not a data-loss risk.

export interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  assignedTo?: string;
  source?: string;
  tags?: string[];
  dateAdded?: string;
  dateUpdated?: string;
  [key: string]: unknown;
}

export interface GhlOpportunity {
  id: string;
  name?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string;
  monetaryValue?: number;
  contactId?: string;
  assignedTo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; position: number }[];
}

export interface GhlAppointment {
  id: string;
  contactId?: string;
  assignedUserId?: string;
  title?: string;
  appointmentStatus?: string;
  startTime?: string;
  endTime?: string;
  [key: string]: unknown;
}

export interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  [key: string]: unknown;
}

// Confirmed against ConversationSchema in github.com/GoHighLevel/highlevel-api-docs
// (apps/conversations.json), fetched 2026-08-03: the Conversation object has
// NO `assignedTo` or `lastMessageDate` field, despite `assignedTo` existing
// as a *search filter* param — ownership/last-activity have to be derived
// from the conversation's messages instead (see sync/conversations.ts).
export interface GhlConversation {
  id: string;
  contactId?: string;
  unreadCount?: number;
  lastMessageType?: string;
  [key: string]: unknown;
}

// Confirmed against GetMessageResponseDto (apps/conversations.json) + the
// InboundMessage/OutboundMessage webhook payload docs (docs/webhook events/),
// fetched 2026-08-03. Calls are NOT a separate GHL resource — a phone call
// is a Message with messageType 'TYPE_CALL' (REST API) or 'CALL' (webhook
// payload), carrying callDuration/callStatus/userId/attachments (recording
// URL) instead of a text body. See sync/conversations.ts CALL_MESSAGE_TYPES.
export interface GhlMessage {
  id: string;
  /** Only present on the raw webhook payload, where it's used instead of `id`. */
  messageId?: string;
  contactId?: string;
  conversationId?: string;
  direction?: string;
  messageType?: string;
  body?: string;
  dateAdded?: string;
  /** The GHL user who placed/received the call, or sent an internal message. */
  userId?: string;
  status?: string;
  /** Call-only fields. */
  callDuration?: number;
  callStatus?: string;
  attachments?: string[];
  [key: string]: unknown;
}
