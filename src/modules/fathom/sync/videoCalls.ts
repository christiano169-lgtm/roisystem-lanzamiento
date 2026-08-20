import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../config/logger.js';
import { fathomGet } from '../client.js';
import { getFathomApiKey } from '../connectionService.js';
import { enqueueQualityAnalysis } from '../../../jobs/queue.js';
import type { FathomMeeting } from '../types.js';

interface FathomMeetingsResponse {
  meetings: FathomMeeting[];
}

const RECENT_MEETINGS_LIMIT = 50;

/**
 * Pulls a closer's recent Fathom meetings and upserts them as VideoCall
 * rows. Unlike the GHL syncers this isn't paginated through a BullMQ-tracked
 * SyncJob — a closer's meeting volume is small enough that "recent N" per
 * run is sufficient for Fase 3; revisit if that stops being true.
 */
export async function syncVideoCallsForConnection(tenantId: string, fathomConnectionId: string) {
  const connection = await prisma.fathomConnection.findUniqueOrThrow({ where: { id: fathomConnectionId } });
  const apiKey = await getFathomApiKey(connection.userId);

  const data = await fathomGet<FathomMeetingsResponse>(apiKey, '/meetings', { limit: RECENT_MEETINGS_LIMIT });

  let synced = 0;
  for (const meeting of data.meetings) {
    try {
      const row = await upsertVideoCall(connection.locationId, connection.userId, meeting);
      synced++;
      if (row.transcript) {
        await enqueueQualityAnalysis({ tenantId, channel: 'video_call', sourceId: row.id });
      }
    } catch (err) {
      logger.error({ err, meetingId: meeting.id }, 'Failed to upsert Fathom meeting');
    }
  }

  await prisma.fathomConnection.update({ where: { id: fathomConnectionId }, data: { lastSyncedAt: new Date() } });
  return synced;
}

async function upsertVideoCall(locationId: string, closerUserId: string, meeting: FathomMeeting) {
  const closer = await prisma.user.findUniqueOrThrow({ where: { id: closerUserId } });

  return prisma.videoCall.upsert({
    where: { closerUserId_fathomMeetingId: { closerUserId, fathomMeetingId: meeting.id } },
    create: {
      locationId,
      closerUserId,
      ownerGhlId: closer.ghlUserId,
      fathomMeetingId: meeting.id,
      title: meeting.title ?? null,
      recordingUrl: meeting.recording_url ?? null,
      transcript: meeting.transcript ?? null,
      durationSeconds: meeting.duration_seconds ?? null,
      occurredAt: meeting.created_at ? new Date(meeting.created_at) : null,
      raw: meeting as object,
    },
    update: {
      title: meeting.title ?? null,
      recordingUrl: meeting.recording_url ?? null,
      transcript: meeting.transcript ?? null,
      durationSeconds: meeting.duration_seconds ?? null,
      raw: meeting as object,
    },
  });
}
