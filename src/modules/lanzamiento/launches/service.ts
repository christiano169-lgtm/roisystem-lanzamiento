import { prisma } from '../../../db/prisma.js';
import type { AttendanceMatchType, LaunchStatus } from '@prisma/client';
import { getFunnel, getOperationalKpis } from '../../kpis/service.js';
import { getHotmartSummary } from '../../hotmart/service.js';
import {
  getLaunchSalesKpis,
  getLaunchSalesRanking,
  getLaunchSalesVolume,
  getLaunchStatusBreakdown,
  type LaunchSalesKpis,
  type LaunchStatusBreakdown,
  type SalesRankingRow,
  type SalesVolumeRow,
} from '../../hotmart/launchSales.js';
import { getLaunchTribeBreakdown, getLaunchCountryBreakdown, type TribeRow, type CountryRow } from './segments.js';
import { getPipelineStatusBreakdown } from './pipelineSales.js';
import { getSettersSummary } from '../setters/service.js';
import type { FunnelStage } from '../../kpis/types.js';

export interface LaunchInput {
  name: string;
  startDate: Date;
  endDate: Date;
  status?: LaunchStatus;
}

export async function listLaunches(locationId: string) {
  return prisma.launch.findMany({ where: { locationId }, orderBy: { startDate: 'desc' } });
}

export interface LaunchComparisonRow {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: LaunchStatus;
  comprasAprobadas: number;
  ingresoBruto: number;
  netoProductor: number;
  ticketPromedio: number;
  leadsGestionados: number;
  conversionPct: number;
  aprobadasPlus: number;
  aprobadasGeneral: number;
}

/**
 * "Rendimiento" — Panel ejecutivo is scoped to one launch at a time; this is
 * the launch-over-launch view, so an agency can see whether the last
 * lanzamiento did better or worse than the ones before it.
 */
export async function getLaunchesComparison(locationId: string): Promise<LaunchComparisonRow[]> {
  const launches = await listLaunches(locationId);
  return Promise.all(
    launches.map(async (launch) => {
      const [salesKpis, statusBreakdown] = await Promise.all([
        getLaunchSalesKpis(locationId, launch.startDate, launch.endDate),
        getLaunchStatusBreakdown(locationId, launch.startDate, launch.endDate),
      ]);
      const totalVentas = salesKpis.comprasAprobadas + salesKpis.upgradesVip + salesKpis.orderBumps;
      return {
        id: launch.id,
        name: launch.name,
        startDate: launch.startDate,
        endDate: launch.endDate,
        status: launch.status,
        comprasAprobadas: salesKpis.comprasAprobadas,
        ingresoBruto: salesKpis.ingresoBruto,
        netoProductor: salesKpis.netoProductor,
        ticketPromedio: salesKpis.ticketPromedio,
        leadsGestionados: salesKpis.leadsGestionados,
        conversionPct: salesKpis.leadsGestionados > 0 ? Math.round((totalVentas / salesKpis.leadsGestionados) * 1000) / 10 : 0,
        aprobadasPlus: statusBreakdown.aprobadas.plus,
        aprobadasGeneral: statusBreakdown.aprobadas.general,
      };
    }),
  );
}

export async function createLaunch(locationId: string, input: LaunchInput) {
  return prisma.launch.create({
    data: {
      locationId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? 'planned',
    },
  });
}

export async function updateLaunch(locationId: string, launchId: string, input: Partial<LaunchInput>) {
  const launch = await prisma.launch.findFirst({ where: { id: launchId, locationId } });
  if (!launch) return null;
  return prisma.launch.update({
    where: { id: launchId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function deleteLaunch(locationId: string, launchId: string) {
  const launch = await prisma.launch.findFirst({ where: { id: launchId, locationId } });
  if (!launch) return false;
  await prisma.launch.delete({ where: { id: launchId } });
  return true;
}

export interface AttendanceRuleInput {
  label: string;
  matchType: AttendanceMatchType;
  tagName?: string;
  formName?: string;
  position?: number;
}

export async function listAttendanceRules(launchId: string) {
  return prisma.launchAttendanceRule.findMany({ where: { launchId }, orderBy: { position: 'asc' } });
}

export async function createAttendanceRule(launchId: string, input: AttendanceRuleInput) {
  return prisma.launchAttendanceRule.create({
    data: {
      launchId,
      label: input.label,
      matchType: input.matchType,
      tagName: input.matchType === 'tag' ? (input.tagName ?? null) : null,
      formName: input.matchType === 'form' ? (input.formName ?? null) : null,
      position: input.position ?? 0,
    },
  });
}

export async function deleteAttendanceRule(launchId: string, ruleId: string) {
  const rule = await prisma.launchAttendanceRule.findFirst({ where: { id: ruleId, launchId } });
  if (!rule) return false;
  await prisma.launchAttendanceRule.delete({ where: { id: ruleId } });
  return true;
}

export interface LaunchPhaseInput {
  label: string;
  startDate: Date;
  endDate: Date;
  position?: number;
}

export function listLaunchPhases(launchId: string) {
  return prisma.launchPhase.findMany({ where: { launchId }, orderBy: { position: 'asc' } });
}

export function createLaunchPhase(launchId: string, input: LaunchPhaseInput) {
  return prisma.launchPhase.create({
    data: { launchId, label: input.label, startDate: input.startDate, endDate: input.endDate, position: input.position ?? 0 },
  });
}

export async function deleteLaunchPhase(launchId: string, phaseId: string) {
  const phase = await prisma.launchPhase.findFirst({ where: { id: phaseId, launchId } });
  if (!phase) return false;
  await prisma.launchPhase.delete({ where: { id: phaseId } });
  return true;
}

export interface AttendanceRow {
  ruleId: string;
  label: string;
  matchType: AttendanceMatchType;
  count: number;
}

/**
 * Counts contacts matching each attendance rule. Tag-based rules count
 * contacts currently carrying that tag — GHL tags don't carry a "date
 * added" we sync, so this can't be windowed to the launch's exact dates,
 * only to which contacts have ever been tagged that way. Form-based rules
 * are precise: they count submissions to that form during the launch's
 * [startDate, endDate].
 */
async function getAttendanceSummary(locationId: string, launch: { id: string; startDate: Date; endDate: Date }): Promise<AttendanceRow[]> {
  const rules = await listAttendanceRules(launch.id);
  if (rules.length === 0) return [];

  const tagNames = rules.filter((r) => r.matchType === 'tag' && r.tagName).map((r) => r.tagName!);
  const formNames = rules.filter((r) => r.matchType === 'form' && r.formName).map((r) => r.formName!);

  const [tagCounts, formCounts] = await Promise.all([
    tagNames.length
      ? prisma.tag.findMany({
          where: { locationId, name: { in: tagNames } },
          select: { name: true, _count: { select: { contacts: true } } },
        })
      : Promise.resolve([]),
    formNames.length
      ? prisma.form.findMany({
          where: { locationId, name: { in: formNames } },
          select: {
            name: true,
            _count: {
              select: {
                submissions: { where: { submittedAt: { gte: launch.startDate, lte: launch.endDate } } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const countByTagName = new Map(tagCounts.map((t) => [t.name, t._count.contacts]));
  const countByFormName = new Map(formCounts.map((f) => [f.name, f._count.submissions]));

  return rules.map((rule) => ({
    ruleId: rule.id,
    label: rule.label,
    matchType: rule.matchType,
    count: rule.matchType === 'tag' ? (countByTagName.get(rule.tagName ?? '') ?? 0) : (countByFormName.get(rule.formName ?? '') ?? 0),
  }));
}

export interface LaunchSummary {
  launch: { id: string; name: string; startDate: Date; endDate: Date; status: LaunchStatus };
  phases: Array<{ id: string; label: string; startDate: Date; endDate: Date }>;
  ventas: {
    ingresos: number;
    efectivoCobrado: number;
    ticketPromedio: number;
    wonCount: number;
    hotmart: { revenue: number; salesCount: number; averageTicket: number; byProduct: Array<{ productName: string; revenue: number; salesCount: number }> };
  };
  embudoVentas: { cerrada: number; ofertada: number; noOfertada: number };
  salesKpis: LaunchSalesKpis;
  salesVolume: SalesVolumeRow[];
  salesRanking: SalesRankingRow[];
  statusBreakdown: LaunchStatusBreakdown;
  tribes: TribeRow[];
  countries: CountryRow[];
  funnel: FunnelStage[];
  asistencia: AttendanceRow[];
  setters: Awaited<ReturnType<typeof getSettersSummary>>;
}

/**
 * The unified "un solo lugar" view the Panel ejecutivo reads from — ventas
 * (Opportunity + Hotmart, deliberately excluding manual Payment per the
 * client's call), funnel, class attendance, and setter chat management, all
 * scoped to a window inside this launch. Pass `window` to narrow to one
 * LaunchPhase (Early bird, etc.) instead of the whole launch — the caller
 * resolves which phase's dates those are.
 */
export async function getLaunchSummary(
  tenantId: string,
  locationId: string,
  launchId: string,
  window?: { from: Date; to: Date },
): Promise<LaunchSummary | null> {
  const launch = await prisma.launch.findFirst({ where: { id: launchId, locationId } });
  if (!launch) return null;

  const from = window?.from ?? launch.startDate;
  const to = window?.to ?? launch.endDate;
  const filters = { from, to };

  const [operational, funnel, hotmart, asistencia, setters, phases, salesKpis, salesVolume, salesRanking, statusBreakdown, tribes, countries] =
    await Promise.all([
      getOperationalKpis(tenantId, locationId, filters),
      getFunnel(tenantId, locationId, filters),
      getHotmartSummary(locationId, from, to),
      getAttendanceSummary(locationId, launch),
      getSettersSummary(locationId, filters),
      listLaunchPhases(launch.id),
      getLaunchSalesKpis(locationId, from, to),
      getLaunchSalesVolume(locationId, from, to),
      getLaunchSalesRanking(locationId, from, to),
      getLaunchStatusBreakdown(locationId, from, to),
      getLaunchTribeBreakdown(locationId, from, to),
      getLaunchCountryBreakdown(locationId, from, to),
    ]);

  // Prefer the GHL-Pipeline-sourced breakdown when the admin has mapped
  // pipelines for it (Configuración → Lanzamientos → Pipelines de venta) —
  // some clients run the whole compras/canceladas/abandonados funnel as
  // GHL Pipelines instead of through Hotmart, and for them the
  // Hotmart-sourced breakdown is correctly all zeros, not a bug.
  const pipelineBreakdown = await getPipelineStatusBreakdown(locationId, from, to);
  const finalStatusBreakdown = pipelineBreakdown ?? statusBreakdown;

  return {
    launch: { id: launch.id, name: launch.name, startDate: launch.startDate, endDate: launch.endDate, status: launch.status },
    phases: phases.map((p) => ({ id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate })),
    ventas: {
      ingresos: operational.ingresos,
      efectivoCobrado: operational.efectivoCobrado,
      ticketPromedio: operational.ticketPromedio,
      wonCount: operational.wonCount,
      hotmart,
    },
    embudoVentas: { cerrada: operational.wonCount, ofertada: operational.ofertadaCount, noOfertada: operational.noOfertadaCount },
    salesKpis,
    salesVolume,
    salesRanking,
    statusBreakdown: finalStatusBreakdown,
    tribes,
    countries,
    funnel,
    asistencia,
    setters,
  };
}
