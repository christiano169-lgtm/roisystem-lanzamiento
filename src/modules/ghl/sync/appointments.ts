import { prisma } from '../../../db/prisma.js';
import { ghlLocationGet } from '../client.js';
import type { GhlAppointment } from '../types.js';
import type { EntitySyncer, SyncPageResult } from './types.js';

// Confirmed against github.com/GoHighLevel/highlevel-api-docs
// (apps/calendars.json), fetched 2026-08-03: GET /calendars/events has NO
// id-based cursor at all — `startTime`+`endTime` (epoch ms) are REQUIRED,
// and one of `userId`/`calendarId`/`groupId` is also required. There is no
// "all appointments for this location" call. So instead of paging through a
// cursor, we sweep every already-synced GhlUser (syncGhlUsers runs before
// this in runner.ts) across a fixed set of rolling time windows.
const WINDOW_MONTHS = 6;
const HISTORY_MONTHS_BACK = 24;
const FUTURE_MONTHS_AHEAD = 6;

export function buildWindows(): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setMonth(rangeStart.getMonth() - HISTORY_MONTHS_BACK);
  const rangeEnd = new Date(now);
  rangeEnd.setMonth(rangeEnd.getMonth() + FUTURE_MONTHS_AHEAD);

  let cursor = new Date(rangeStart);
  while (cursor < rangeEnd) {
    const windowEnd = new Date(cursor);
    windowEnd.setMonth(windowEnd.getMonth() + WINDOW_MONTHS);
    const end = windowEnd > rangeEnd ? rangeEnd : windowEnd;
    windows.push({ start: cursor.getTime(), end: end.getTime() });
    cursor = end;
  }
  return windows;
}

interface GhlAppointmentsResponse {
  events: GhlAppointment[];
}

interface AppointmentsCursor {
  userIndex: number;
  windowIndex: number;
}

export const appointmentsSyncer: EntitySyncer = {
  async syncPage(tenantId, locationId, ghlLocationId, cursorRaw): Promise<SyncPageResult> {
    const cursor: AppointmentsCursor = cursorRaw ? JSON.parse(cursorRaw) : { userIndex: 0, windowIndex: 0 };
    const users = await prisma.ghlUser.findMany({ where: { locationId }, orderBy: { ghlUserId: 'asc' } });
    const windows = buildWindows();

    if (users.length === 0 || cursor.userIndex >= users.length) {
      return { recordsSynced: 0, nextCursor: null };
    }

    const user = users[cursor.userIndex]!;
    const window = windows[cursor.windowIndex]!;

    const data = await ghlLocationGet<GhlAppointmentsResponse>(tenantId, ghlLocationId, '/calendars/events', {
      locationId: ghlLocationId,
      userId: user.ghlUserId,
      startTime: window.start,
      endTime: window.end,
    });

    for (const appt of data.events) {
      await upsertAppointment(locationId, appt);
    }

    const nextWindowIndex = cursor.windowIndex + 1;
    const next: AppointmentsCursor =
      nextWindowIndex < windows.length ? { userIndex: cursor.userIndex, windowIndex: nextWindowIndex } : { userIndex: cursor.userIndex + 1, windowIndex: 0 };

    const done = next.userIndex >= users.length;
    return { recordsSynced: data.events.length, nextCursor: done ? null : JSON.stringify(next) };
  },
};

async function upsertAppointment(locationId: string, appt: GhlAppointment) {
  return prisma.appointment.upsert({
    where: { locationId_ghlId: { locationId, ghlId: appt.id } },
    create: {
      locationId,
      ghlId: appt.id,
      contactGhlId: appt.contactId ?? null,
      ownerGhlId: appt.assignedUserId ?? null,
      title: appt.title ?? null,
      status: appt.appointmentStatus ?? null,
      startTime: appt.startTime ? new Date(appt.startTime) : null,
      endTime: appt.endTime ? new Date(appt.endTime) : null,
      raw: appt as object,
    },
    update: {
      status: appt.appointmentStatus ?? null,
      startTime: appt.startTime ? new Date(appt.startTime) : null,
      endTime: appt.endTime ? new Date(appt.endTime) : null,
      raw: appt as object,
    },
  });
}

export { upsertAppointment };
