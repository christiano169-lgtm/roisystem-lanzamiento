import { prisma } from '../../../db/prisma.js';

export interface SetterFilters {
  from?: Date;
  to?: Date;
}

export interface SetterRow {
  ownerGhlId: string;
  name: string;
  assignados: number;
  atendidos: number;
  pendientes: number;
  primeraRespuestaMinutosPromedio: number | null;
  citas: number;
  calidadIaPromedio: number | null;
}

function conversationWhere(locationId: string, filters: SetterFilters) {
  return {
    locationId,
    ...(filters.from || filters.to
      ? { lastMessageAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  };
}

/**
 * Powers the Setters screen. Assigned/atendidos/pendientes and the
 * first-response lag are computed in JS over each conversation's messages —
 * Prisma can't express "first inbound vs first outbound timestamp" as a
 * single aggregate query, and the per-location/range conversation count is
 * bounded the same way getQualitySummary's recent-notes query is.
 */
export async function getSettersSummary(locationId: string, filters: SetterFilters): Promise<SetterRow[]> {
  const [conversations, ghlUsers, appointments, qualityRows] = await Promise.all([
    prisma.conversation.findMany({
      where: conversationWhere(locationId, filters),
      include: { messages: { orderBy: { ghlCreatedAt: 'asc' } } },
    }),
    prisma.ghlUser.findMany({ where: { locationId } }),
    prisma.appointment.findMany({
      where: {
        locationId,
        ...(filters.from || filters.to
          ? { startTime: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
          : {}),
      },
      select: { ownerGhlId: true },
    }),
    prisma.qualityAnalysis.findMany({
      where: { locationId, channel: 'chat', ...(filters.from || filters.to ? { analyzedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}) },
      select: { ownerGhlId: true, qualityScore: true },
    }),
  ]);

  const nameByOwner = new Map(ghlUsers.map((u) => [u.ghlUserId, u.name]));

  type Acc = { assignados: number; atendidos: number; lags: number[] };
  const byOwner = new Map<string, Acc>();
  for (const conv of conversations) {
    if (!conv.ownerGhlId) continue;
    const acc = byOwner.get(conv.ownerGhlId) ?? { assignados: 0, atendidos: 0, lags: [] };
    acc.assignados++;
    const firstInbound = conv.messages.find((m) => m.direction === 'inbound' && m.ghlCreatedAt);
    const firstOutbound = conv.messages.find((m) => m.direction === 'outbound' && m.ghlCreatedAt);
    if (firstOutbound) acc.atendidos++;
    if (firstInbound?.ghlCreatedAt && firstOutbound?.ghlCreatedAt && firstOutbound.ghlCreatedAt >= firstInbound.ghlCreatedAt) {
      acc.lags.push((firstOutbound.ghlCreatedAt.getTime() - firstInbound.ghlCreatedAt.getTime()) / 60000);
    }
    byOwner.set(conv.ownerGhlId, acc);
  }

  const citasByOwner = new Map<string, number>();
  for (const a of appointments) {
    if (!a.ownerGhlId) continue;
    citasByOwner.set(a.ownerGhlId, (citasByOwner.get(a.ownerGhlId) ?? 0) + 1);
  }

  const qualityByOwner = new Map<string, number[]>();
  for (const q of qualityRows) {
    if (!q.ownerGhlId) continue;
    const list = qualityByOwner.get(q.ownerGhlId) ?? [];
    list.push(Number(q.qualityScore));
    qualityByOwner.set(q.ownerGhlId, list);
  }

  return Array.from(byOwner.entries())
    .map(([ownerGhlId, acc]) => {
      const quality = qualityByOwner.get(ownerGhlId);
      return {
        ownerGhlId,
        name: nameByOwner.get(ownerGhlId) ?? ownerGhlId,
        assignados: acc.assignados,
        atendidos: acc.atendidos,
        pendientes: acc.assignados - acc.atendidos,
        primeraRespuestaMinutosPromedio: acc.lags.length ? Math.round((acc.lags.reduce((s, v) => s + v, 0) / acc.lags.length) * 10) / 10 : null,
        citas: citasByOwner.get(ownerGhlId) ?? 0,
        calidadIaPromedio: quality?.length ? Math.round((quality.reduce((s, v) => s + v, 0) / quality.length) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.assignados - a.assignados);
}

export interface SetterConversationRow {
  conversationId: string;
  contactName: string;
  contactPhone: string | null;
  ownerGhlId: string | null;
  ownerName: string;
  status: 'atendido' | 'pendiente';
  lastMessageAt: string | null;
  primeraRespuestaMinutos: number | null;
}

/**
 * Per-conversation drill-down behind the Setters table — answers "¿quién
 * respondió y quién no, y cuándo?" at the individual chat level instead of
 * only the aggregated counts getSettersSummary produces.
 */
export async function getSettersDetail(locationId: string, filters: SetterFilters, ownerGhlId?: string): Promise<SetterConversationRow[]> {
  const [conversations, ghlUsers] = await Promise.all([
    prisma.conversation.findMany({
      where: { ...conversationWhere(locationId, filters), ...(ownerGhlId ? { ownerGhlId } : {}) },
      include: { messages: { orderBy: { ghlCreatedAt: 'asc' } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 500,
    }),
    prisma.ghlUser.findMany({ where: { locationId } }),
  ]);

  const nameByOwner = new Map(ghlUsers.map((u) => [u.ghlUserId, u.name]));

  // Conversations carry `contactGhlId`, not the Contact row's own id — this
  // resolves display names the same way Bandeja does, without assuming
  // every conversation has a matching synced Contact.
  const contactGhlIds = conversations.map((c) => c.contactGhlId).filter((id): id is string => !!id);
  const contacts = contactGhlIds.length
    ? await prisma.contact.findMany({ where: { locationId, ghlId: { in: contactGhlIds } }, select: { ghlId: true, firstName: true, lastName: true, phone: true } })
    : [];
  const contactByGhlId = new Map(contacts.map((c) => [c.ghlId, c]));

  return conversations.map((conv) => {
    const contact = conv.contactGhlId ? contactByGhlId.get(conv.contactGhlId) : undefined;
    const firstInbound = conv.messages.find((m) => m.direction === 'inbound' && m.ghlCreatedAt);
    const firstOutbound = conv.messages.find((m) => m.direction === 'outbound' && m.ghlCreatedAt);
    const primeraRespuestaMinutos =
      firstInbound?.ghlCreatedAt && firstOutbound?.ghlCreatedAt && firstOutbound.ghlCreatedAt >= firstInbound.ghlCreatedAt
        ? Math.round(((firstOutbound.ghlCreatedAt.getTime() - firstInbound.ghlCreatedAt.getTime()) / 60000) * 10) / 10
        : null;

    return {
      conversationId: conv.id,
      contactName: [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || contact?.phone || '(sin nombre)',
      contactPhone: contact?.phone ?? null,
      ownerGhlId: conv.ownerGhlId,
      ownerName: conv.ownerGhlId ? (nameByOwner.get(conv.ownerGhlId) ?? conv.ownerGhlId) : 'Sin asignar',
      status: firstOutbound ? 'atendido' : 'pendiente',
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      primeraRespuestaMinutos,
    };
  });
}
