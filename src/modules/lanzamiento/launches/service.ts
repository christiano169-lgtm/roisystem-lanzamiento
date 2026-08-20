import { prisma } from '../../../db/prisma.js';
import type { AttendanceMatchType, LaunchStatus } from '@prisma/client';
import { getFunnel, getOperationalKpis } from '../../kpis/service.js';
import { getHotmartSummary } from '../../hotmart/service.js';
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
  ventas: {
    ingresos: number;
    efectivoCobrado: number;
    ticketPromedio: number;
    wonCount: number;
    hotmart: { revenue: number; salesCount: number; averageTicket: number; byProduct: Array<{ productName: string; revenue: number; salesCount: number }> };
  };
  funnel: FunnelStage[];
  asistencia: AttendanceRow[];
  setters: Awaited<ReturnType<typeof getSettersSummary>>;
}

/**
 * The unified "un solo lugar" view the launch dashboard reads from — ventas
 * (Opportunity + Hotmart, deliberately excluding manual Payment per the
 * client's call), funnel, class attendance, and setter chat management, all
 * scoped to this launch's date window instead of the subaccount's whole
 * lifetime.
 */
export async function getLaunchSummary(tenantId: string, locationId: string, launchId: string): Promise<LaunchSummary | null> {
  const launch = await prisma.launch.findFirst({ where: { id: launchId, locationId } });
  if (!launch) return null;

  const filters = { from: launch.startDate, to: launch.endDate };

  const [operational, funnel, hotmart, asistencia, setters] = await Promise.all([
    getOperationalKpis(tenantId, locationId, filters),
    getFunnel(tenantId, locationId, filters),
    getHotmartSummary(locationId, launch.startDate, launch.endDate),
    getAttendanceSummary(locationId, launch),
    getSettersSummary(locationId, filters),
  ]);

  return {
    launch: { id: launch.id, name: launch.name, startDate: launch.startDate, endDate: launch.endDate, status: launch.status },
    ventas: {
      ingresos: operational.ingresos,
      efectivoCobrado: operational.efectivoCobrado,
      ticketPromedio: operational.ticketPromedio,
      wonCount: operational.wonCount,
      hotmart,
    },
    funnel,
    asistencia,
    setters,
  };
}
