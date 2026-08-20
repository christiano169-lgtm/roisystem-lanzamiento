import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { listLocations } from '../locations/service.js';
import type { AcquisitionRow, AdvisorRankingRow, FunnelStage, KpiFilters, MultiLocationOperationalKpis, OperationalKpis } from './types.js';

// --- GHL status/enum values --------------------------------------------------
// 'completed' for an answered call is CONFIRMED against GHL's own
// InboundMessage webhook example (docs/webhook events/InboundMessage.md,
// github.com/GoHighLevel/highlevel-api-docs, fetched 2026-08-03) — a
// person-answered call has callStatus: 'completed'; voicemail has
// 'voicemail'. 'answered' is kept as a defensive extra match. Appointment
// and opportunity status values are NOT documented in an enum anywhere in
// the same docs (opportunity `status` example was just `"open"`) — those
// two stay best-effort assumptions; adjust once real synced data confirms
// what your account actually returns.
const ANSWERED_CALL_STATUSES = ['completed', 'answered'];
const ATTENDED_APPOINTMENT_STATUSES = ['showed', 'completed', 'confirmed'];
const WON_OPPORTUNITY_STATUS = 'won';

export function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Tag filtering only has meaning against Contact (tags live there). Calls and
 * Appointments only store `contactGhlId` (no FK to our internal Contact row),
 * so callers that need to scope those two entities by tag resolve the
 * matching ghlIds here first and filter with `contactGhlId: { in: [...] }`.
 * Opportunity *does* have a proper `contact` relation and can filter tags
 * directly via a nested `contact.tags.some(...)` clause instead.
 * Returns `null` when no tag filter is active (caller should skip the
 * contactGhlId clause entirely rather than filtering on an empty array).
 */
async function resolveTagContactGhlIds(locationId: string, tagNames?: string[]): Promise<string[] | null> {
  if (!tagNames || tagNames.length === 0) return null;
  const contacts = await prisma.contact.findMany({
    where: { locationId, tags: { some: { tag: { name: { in: tagNames } } } } },
    select: { ghlId: true },
  });
  return contacts.map((c) => c.ghlId);
}

function dateRange(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

function contactWhere(locationId: string, filters: KpiFilters): Prisma.ContactWhereInput {
  const range = dateRange(filters.from, filters.to);
  return {
    locationId,
    ...(filters.ownerGhlId ? { ownerGhlId: filters.ownerGhlId } : {}),
    ...(range ? { ghlCreatedAt: range } : {}),
    ...(filters.tagNames?.length ? { tags: { some: { tag: { name: { in: filters.tagNames } } } } } : {}),
  };
}

function callWhere(locationId: string, filters: KpiFilters, tagContactGhlIds: string[] | null): Prisma.CallWhereInput {
  const range = dateRange(filters.from, filters.to);
  return {
    locationId,
    ...(filters.ownerGhlId ? { ownerGhlId: filters.ownerGhlId } : {}),
    ...(range ? { ghlCreatedAt: range } : {}),
    ...(tagContactGhlIds ? { contactGhlId: { in: tagContactGhlIds } } : {}),
  };
}

function appointmentWhere(locationId: string, filters: KpiFilters, tagContactGhlIds: string[] | null): Prisma.AppointmentWhereInput {
  const range = dateRange(filters.from, filters.to);
  return {
    locationId,
    ...(filters.ownerGhlId ? { ownerGhlId: filters.ownerGhlId } : {}),
    ...(range ? { startTime: range } : {}),
    ...(tagContactGhlIds ? { contactGhlId: { in: tagContactGhlIds } } : {}),
  };
}

function opportunityWhere(locationId: string, filters: KpiFilters): Prisma.OpportunityWhereInput {
  const range = dateRange(filters.from, filters.to);
  return {
    locationId,
    ...(filters.ownerGhlId ? { ownerGhlId: filters.ownerGhlId } : {}),
    ...(range ? { ghlCreatedAt: range } : {}),
    ...(filters.tagNames?.length ? { contact: { tags: { some: { tag: { name: { in: filters.tagNames } } } } } } : {}),
  };
}

async function sumRevenue(locationId: string, filters: KpiFilters): Promise<number> {
  const agg = await prisma.opportunity.aggregate({
    where: { ...opportunityWhere(locationId, filters), status: WON_OPPORTUNITY_STATUS },
    _sum: { monetaryValue: true },
  });
  return Number(agg._sum.monetaryValue ?? 0);
}

async function sumCashCollected(locationId: string, filters: KpiFilters): Promise<number> {
  const range = dateRange(filters.from, filters.to);
  const agg = await prisma.payment.aggregate({
    where: {
      locationId,
      ...(range ? { collectedAt: range } : {}),
      opportunity: filters.ownerGhlId ? { ownerGhlId: filters.ownerGhlId } : undefined,
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

/** Average minutes between a contact's creation and their first Call, and
 * average number of calls per contact — computed in application code from a
 * per-contact grouped aggregate rather than a hand-written correlated SQL
 * query, so it stays type-checked against the schema. */
async function callTimingStats(locationId: string, filters: KpiFilters, tagContactGhlIds: string[] | null) {
  const contacts = await prisma.contact.findMany({
    where: contactWhere(locationId, filters),
    select: { ghlId: true, ghlCreatedAt: true },
  });
  if (contacts.length === 0) return { tiempoAlLeadMinutosPromedio: null, intentosPromedio: null };

  const relevantGhlIds = tagContactGhlIds
    ? contacts.map((c) => c.ghlId).filter((id) => tagContactGhlIds.includes(id))
    : contacts.map((c) => c.ghlId);

  const perContact = await prisma.call.groupBy({
    by: ['contactGhlId'],
    where: { locationId, contactGhlId: { in: relevantGhlIds } },
    _min: { ghlCreatedAt: true },
    _count: { _all: true },
  });

  const contactCreatedAt = new Map(contacts.map((c) => [c.ghlId, c.ghlCreatedAt]));
  const minutesToFirstCall: number[] = [];
  const callCounts: number[] = [];

  for (const row of perContact) {
    if (!row.contactGhlId) continue;
    callCounts.push(row._count._all);
    const createdAt = contactCreatedAt.get(row.contactGhlId);
    if (createdAt && row._min.ghlCreatedAt) {
      minutesToFirstCall.push((row._min.ghlCreatedAt.getTime() - createdAt.getTime()) / 60_000);
    }
  }

  return {
    tiempoAlLeadMinutosPromedio: average(minutesToFirstCall),
    intentosPromedio: average(callCounts),
  };
}

export async function getOperationalKpis(_tenantId: string, locationId: string, filters: KpiFilters): Promise<OperationalKpis> {
  const tagContactGhlIds = await resolveTagContactGhlIds(locationId, filters.tagNames);

  const [leadsGenerados, llamadas, contestadas, agendadas, asistidas, ingresos, efectivoCobrado, timing] = await Promise.all([
    prisma.contact.count({ where: contactWhere(locationId, filters) }),
    prisma.call.count({ where: callWhere(locationId, filters, tagContactGhlIds) }),
    prisma.call.count({ where: { ...callWhere(locationId, filters, tagContactGhlIds), status: { in: ANSWERED_CALL_STATUSES } } }),
    prisma.appointment.count({ where: appointmentWhere(locationId, filters, tagContactGhlIds) }),
    prisma.appointment.count({
      where: { ...appointmentWhere(locationId, filters, tagContactGhlIds), status: { in: ATTENDED_APPOINTMENT_STATUSES } },
    }),
    sumRevenue(locationId, filters),
    sumCashCollected(locationId, filters),
    callTimingStats(locationId, filters, tagContactGhlIds),
  ]);

  const wonCount = await prisma.opportunity.count({ where: { ...opportunityWhere(locationId, filters), status: WON_OPPORTUNITY_STATUS } });

  // "Ofertada" vs "No_Ofertada" — GHL's `status` field isn't documented
  // beyond 'open'/'won' (see the module-level comment above), so this can't
  // be a real status check. Proxy instead on whether the opportunity has a
  // monetaryValue set — a price attached is a reasonable stand-in for "an
  // offer was presented" — rather than fabricate a status GHL doesn't
  // confirm returning.
  const openWhere = { ...opportunityWhere(locationId, filters), status: { not: WON_OPPORTUNITY_STATUS } };
  const [ofertadaCount, noOfertadaCount] = await Promise.all([
    prisma.opportunity.count({ where: { ...openWhere, monetaryValue: { not: null } } }),
    prisma.opportunity.count({ where: { ...openWhere, monetaryValue: null } }),
  ]);

  return {
    leadsGenerados,
    llamadas,
    contestadas,
    tasaContestacionPct: pct(contestadas, llamadas),
    tiempoAlLeadMinutosPromedio: timing.tiempoAlLeadMinutosPromedio,
    intentosPromedio: timing.intentosPromedio,
    agendadas,
    asistidas,
    ingresos,
    efectivoCobrado,
    ticketPromedio: wonCount > 0 ? Math.round((ingresos / wonCount) * 100) / 100 : 0,
    wonCount,
    ofertadaCount,
    noOfertadaCount,
  };
}

/**
 * Agency-wide rollup ("todas las subcuentas en un solo KPI") — runs the
 * same per-location `getOperationalKpis` across every Location the tenant
 * owns and sums the results. Rates/averages are recomputed from the summed
 * raw counts (not averaged directly) so they stay mathematically consistent
 * with the totals, e.g. `ticketPromedio` uses the combined `wonCount` rather
 * than averaging each location's already-divided ticket value.
 */
export async function getMultiLocationOperationalKpis(tenantId: string, filters: KpiFilters): Promise<MultiLocationOperationalKpis> {
  const locations = await listLocations(tenantId);

  const byLocation = await Promise.all(
    locations.map(async (location) => ({
      locationId: location.id,
      locationName: location.name,
      kpis: await getOperationalKpis(tenantId, location.id, filters),
    })),
  );

  const sum = (pick: (k: OperationalKpis) => number) => byLocation.reduce((acc, l) => acc + pick(l.kpis), 0);

  const leadsGenerados = sum((k) => k.leadsGenerados);
  const llamadas = sum((k) => k.llamadas);
  const contestadas = sum((k) => k.contestadas);
  const agendadas = sum((k) => k.agendadas);
  const asistidas = sum((k) => k.asistidas);
  const ingresos = sum((k) => k.ingresos);
  const efectivoCobrado = sum((k) => k.efectivoCobrado);
  const wonCount = sum((k) => k.wonCount);
  const ofertadaCount = sum((k) => k.ofertadaCount);
  const noOfertadaCount = sum((k) => k.noOfertadaCount);

  const timingValues = byLocation.map((l) => l.kpis.tiempoAlLeadMinutosPromedio).filter((v): v is number => v !== null);
  const intentosValues = byLocation.map((l) => l.kpis.intentosPromedio).filter((v): v is number => v !== null);

  return {
    totals: {
      leadsGenerados,
      llamadas,
      contestadas,
      tasaContestacionPct: pct(contestadas, llamadas),
      tiempoAlLeadMinutosPromedio: average(timingValues),
      intentosPromedio: average(intentosValues),
      agendadas,
      asistidas,
      ingresos,
      efectivoCobrado,
      ticketPromedio: wonCount > 0 ? Math.round((ingresos / wonCount) * 100) / 100 : 0,
      wonCount,
      ofertadaCount,
      noOfertadaCount,
    },
    byLocation,
  };
}

export async function getFunnel(_tenantId: string, locationId: string, filters: KpiFilters): Promise<FunnelStage[]> {
  const grouped = await prisma.opportunity.groupBy({
    by: ['pipelineStageId'],
    where: opportunityWhere(locationId, filters),
    _count: { _all: true },
  });

  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
  const stageIds = grouped.map((row) => row.pipelineStageId).filter((id): id is string => id !== null);
  const stages = await prisma.pipelineStage.findMany({ where: { id: { in: stageIds } } });
  const stageById = new Map(stages.map((s) => [s.id, s]));

  return grouped
    .map((row) => {
      const stage = row.pipelineStageId ? stageById.get(row.pipelineStageId) : undefined;
      return {
        pipelineStageId: row.pipelineStageId,
        pipelineName: stage?.pipelineName ?? 'Sin pipeline',
        stageName: stage?.stageName ?? 'Sin etapa',
        count: row._count._all,
        percentageOfTotalPct: pct(row._count._all, total),
      };
    })
    .sort((a, b) => b.count - a.count);
}

export interface DailyVolumeRow {
  date: string; // yyyy-mm-dd
  llamadas: number;
  citas: number;
  cierres: number;
}

/** Powers Panel ejecutivo's "Volumen: llamadas, citas y cierres" chart. Bucketed by day in JS — the range is already bounded by the same date filter every other KPI card uses, so this stays cheap. */
export async function getDailyVolume(locationId: string, filters: KpiFilters): Promise<DailyVolumeRow[]> {
  const tagContactGhlIds = await resolveTagContactGhlIds(locationId, filters.tagNames);
  const [calls, appointments, wonOpportunities] = await Promise.all([
    prisma.call.findMany({ where: callWhere(locationId, filters, tagContactGhlIds), select: { ghlCreatedAt: true } }),
    prisma.appointment.findMany({ where: appointmentWhere(locationId, filters, tagContactGhlIds), select: { startTime: true } }),
    prisma.opportunity.findMany({
      where: { ...opportunityWhere(locationId, filters), status: WON_OPPORTUNITY_STATUS },
      select: { ghlUpdatedAt: true },
    }),
  ]);

  const buckets = new Map<string, DailyVolumeRow>();
  const bump = (date: Date | null, key: 'llamadas' | 'citas' | 'cierres') => {
    if (!date) return;
    const day = date.toISOString().slice(0, 10);
    const row = buckets.get(day) ?? { date: day, llamadas: 0, citas: 0, cierres: 0 };
    row[key]++;
    buckets.set(day, row);
  };
  for (const c of calls) bump(c.ghlCreatedAt, 'llamadas');
  for (const a of appointments) bump(a.startTime, 'citas');
  for (const o of wonOpportunities) bump(o.ghlUpdatedAt, 'cierres');

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRankingByAdvisor(_tenantId: string, locationId: string, filters: KpiFilters): Promise<AdvisorRankingRow[]> {
  const tagContactGhlIds = await resolveTagContactGhlIds(locationId, filters.tagNames);

  const [leadsByOwner, callsByOwner, answeredByOwner, apptByOwner, attendedByOwner, revenueByOwner, ghlUsers] = await Promise.all([
    prisma.contact.groupBy({ by: ['ownerGhlId'], where: contactWhere(locationId, filters), _count: { _all: true } }),
    prisma.call.groupBy({ by: ['ownerGhlId'], where: callWhere(locationId, filters, tagContactGhlIds), _count: { _all: true } }),
    prisma.call.groupBy({
      by: ['ownerGhlId'],
      where: { ...callWhere(locationId, filters, tagContactGhlIds), status: { in: ANSWERED_CALL_STATUSES } },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({ by: ['ownerGhlId'], where: appointmentWhere(locationId, filters, tagContactGhlIds), _count: { _all: true } }),
    prisma.appointment.groupBy({
      by: ['ownerGhlId'],
      where: { ...appointmentWhere(locationId, filters, tagContactGhlIds), status: { in: ATTENDED_APPOINTMENT_STATUSES } },
      _count: { _all: true },
    }),
    prisma.opportunity.groupBy({
      by: ['ownerGhlId'],
      where: { ...opportunityWhere(locationId, filters), status: WON_OPPORTUNITY_STATUS },
      _sum: { monetaryValue: true },
    }),
    prisma.ghlUser.findMany({ where: { locationId } }),
  ]);

  const paymentsRange = dateRange(filters.from, filters.to);
  const payments = await prisma.payment.findMany({
    where: {
      locationId,
      ...(paymentsRange ? { collectedAt: paymentsRange } : {}),
    },
    include: { opportunity: { select: { ownerGhlId: true } } },
  });
  const cashByOwner = new Map<string, number>();
  for (const payment of payments) {
    const owner = payment.opportunity.ownerGhlId;
    if (!owner) continue;
    cashByOwner.set(owner, (cashByOwner.get(owner) ?? 0) + Number(payment.amount));
  }

  const nameByOwner = new Map(ghlUsers.map((u) => [u.ghlUserId, u.name]));
  const toMap = <T extends { ownerGhlId: string | null }>(rows: T[]) => new Map(rows.filter((r) => r.ownerGhlId).map((r) => [r.ownerGhlId as string, r]));

  const leadsMap = toMap(leadsByOwner);
  const callsMap = toMap(callsByOwner);
  const answeredMap = toMap(answeredByOwner);
  const apptMap = toMap(apptByOwner);
  const attendedMap = toMap(attendedByOwner);
  const revenueMap = toMap(revenueByOwner);

  const owners = new Set([...leadsMap.keys(), ...callsMap.keys(), ...apptMap.keys(), ...revenueMap.keys(), ...cashByOwner.keys()]);

  const rows: AdvisorRankingRow[] = [];
  for (const owner of owners) {
    if (filters.ownerGhlId && owner !== filters.ownerGhlId) continue;
    const leads = leadsMap.get(owner)?._count._all ?? 0;
    const agendadas = apptMap.get(owner)?._count._all ?? 0;
    rows.push({
      ownerGhlId: owner,
      name: nameByOwner.get(owner) ?? owner,
      leads,
      llamadas: callsMap.get(owner)?._count._all ?? 0,
      contestadas: answeredMap.get(owner)?._count._all ?? 0,
      tiempoAlLeadMinutosPromedio: null, // per-advisor timing is a heavier query; see getAdvisorPanel for the single-advisor version
      agendadas,
      asistidas: attendedMap.get(owner)?._count._all ?? 0,
      facturacion: Number(revenueMap.get(owner)?._sum.monetaryValue ?? 0),
      efectivoCobrado: cashByOwner.get(owner) ?? 0,
      tasaAgendamientoPct: pct(agendadas, leads),
    });
  }

  return rows.sort((a, b) => b.facturacion - a.facturacion);
}

export async function getAdvisorPanel(
  tenantId: string,
  locationId: string,
  ownerGhlId: string,
  filters: Omit<KpiFilters, 'ownerGhlId'>,
): Promise<AdvisorRankingRow> {
  const scoped: KpiFilters = { ...filters, ownerGhlId };
  const tagContactGhlIds = await resolveTagContactGhlIds(locationId, scoped.tagNames);
  const [rows, timing] = await Promise.all([
    getRankingByAdvisor(tenantId, locationId, scoped),
    callTimingStats(locationId, scoped, tagContactGhlIds),
  ]);
  const row = rows[0];
  if (!row) {
    const ghlUser = await prisma.ghlUser.findUnique({ where: { locationId_ghlUserId: { locationId, ghlUserId: ownerGhlId } } });
    return {
      ownerGhlId,
      name: ghlUser?.name ?? ownerGhlId,
      leads: 0,
      llamadas: 0,
      contestadas: 0,
      tiempoAlLeadMinutosPromedio: null,
      agendadas: 0,
      asistidas: 0,
      facturacion: 0,
      efectivoCobrado: 0,
      tasaAgendamientoPct: 0,
    };
  }
  return { ...row, tiempoAlLeadMinutosPromedio: timing.tiempoAlLeadMinutosPromedio };
}

export async function getAcquisitionBySource(_tenantId: string, locationId: string, filters: KpiFilters): Promise<AcquisitionRow[]> {
  const contacts = await prisma.contact.findMany({
    where: contactWhere(locationId, filters),
    select: { ghlId: true, id: true, source: true },
  });

  const sourceByGhlId = new Map(contacts.map((c) => [c.ghlId, c.source ?? 'Desconocido']));
  const ghlIds = contacts.map((c) => c.ghlId);
  const contactIds = contacts.map((c) => c.id);

  const [calls, appointments, opportunities] = await Promise.all([
    prisma.call.findMany({ where: { locationId, contactGhlId: { in: ghlIds } }, select: { contactGhlId: true, status: true } }),
    prisma.appointment.findMany({ where: { locationId, contactGhlId: { in: ghlIds } }, select: { contactGhlId: true, status: true } }),
    prisma.opportunity.findMany({
      where: { locationId, contactId: { in: contactIds }, status: WON_OPPORTUNITY_STATUS },
      select: { contactId: true, monetaryValue: true },
    }),
  ]);
  const contactIdToGhlId = new Map(contacts.map((c) => [c.id, c.ghlId]));

  interface Bucket {
    leads: number;
    llamados: number;
    contestaron: number;
    agendaron: number;
    asistieron: number;
    cerrados: number;
    facturacion: number;
  }
  const buckets = new Map<string, Bucket>();
  const bucketFor = (source: string) => {
    let b = buckets.get(source);
    if (!b) {
      b = { leads: 0, llamados: 0, contestaron: 0, agendaron: 0, asistieron: 0, cerrados: 0, facturacion: 0 };
      buckets.set(source, b);
    }
    return b;
  };

  for (const contact of contacts) bucketFor(sourceByGhlId.get(contact.ghlId) ?? 'Desconocido').leads++;
  for (const call of calls) {
    if (!call.contactGhlId) continue;
    const b = bucketFor(sourceByGhlId.get(call.contactGhlId) ?? 'Desconocido');
    b.llamados++;
    if (call.status && ANSWERED_CALL_STATUSES.includes(call.status)) b.contestaron++;
  }
  for (const appt of appointments) {
    if (!appt.contactGhlId) continue;
    const b = bucketFor(sourceByGhlId.get(appt.contactGhlId) ?? 'Desconocido');
    b.agendaron++;
    if (appt.status && ATTENDED_APPOINTMENT_STATUSES.includes(appt.status)) b.asistieron++;
  }
  for (const opp of opportunities) {
    if (!opp.contactId) continue;
    const ghlId = contactIdToGhlId.get(opp.contactId);
    if (!ghlId) continue;
    const b = bucketFor(sourceByGhlId.get(ghlId) ?? 'Desconocido');
    b.cerrados++;
    b.facturacion += Number(opp.monetaryValue ?? 0);
  }

  return [...buckets.entries()]
    .map(([source, b]) => ({
      source,
      leads: b.leads,
      llamados: b.llamados,
      contestaron: b.contestaron,
      agendaron: b.agendaron,
      asistieron: b.asistieron,
      facturacion: b.facturacion,
      tasaContactoPct: pct(b.contestaron, b.llamados),
      tasaAgendamientoPct: pct(b.agendaron, b.leads),
      tasaAsistenciaPct: pct(b.asistieron, b.agendaron),
      tasaCierrePct: pct(b.cerrados, b.asistieron),
    }))
    .sort((a, b) => b.leads - a.leads);
}
