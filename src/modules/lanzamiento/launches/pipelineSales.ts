import { prisma } from '../../../db/prisma.js';
import type { PipelineRole, PipelineTier } from '@prisma/client';

export function listPipelineRoleMappings(locationId: string) {
  return prisma.pipelineRoleMapping.findMany({ where: { locationId }, orderBy: { createdAt: 'asc' } });
}

export async function setPipelineRoleMapping(locationId: string, input: { ghlPipelineId: string; pipelineName: string; role: PipelineRole; tier: PipelineTier }) {
  return prisma.pipelineRoleMapping.upsert({
    where: { locationId_role_tier: { locationId, role: input.role, tier: input.tier } },
    create: { locationId, ...input },
    update: { ghlPipelineId: input.ghlPipelineId, pipelineName: input.pipelineName },
  });
}

export async function deletePipelineRoleMapping(locationId: string, id: string) {
  const row = await prisma.pipelineRoleMapping.findFirst({ where: { id, locationId } });
  if (!row) return false;
  await prisma.pipelineRoleMapping.delete({ where: { id } });
  return true;
}

const RECOVERED_HINT = /recuperad/i;
const CASH_TICKET_HINT = /ticket/i;
const REFUND_HINT = /reembolso/i;
const LOST_HINT = /perdido|cancelad/i;

export interface StatusBreakdownBucket {
  plus: number;
  general: number;
}

export interface PipelineStatusBreakdown {
  aprobadas: StatusBreakdownBucket;
  abandonados: StatusBreakdownBucket;
  canceladas: StatusBreakdownBucket;
  ticketsEmitidos: StatusBreakdownBucket;
  recovery: { total: number; recuperados: number; pendientes: number };
}

/**
 * "Dinero sobre la mesa" sourced from GHL Opportunities/Pipelines instead
 * of Hotmart — for clients who track the whole purchase/cancellation/
 * abandoned-cart funnel as dedicated Pipelines (see PipelineRoleMapping's
 * schema comment). An Opportunity currently sitting in a mapped pipeline
 * counts as belonging to that role; its current stage name is matched
 * against RECOVERED_HINT/CASH_TICKET_HINT/LOST_HINT to sub-categorize
 * without needing per-client stage configuration — works for this
 * client's "Recuperado"/"Ticket en Efectivo"/"Perdido Definitivo" naming
 * and is resilient to similar wording since it's a loose keyword match,
 * not an exact string.
 */
export async function getPipelineStatusBreakdown(locationId: string, from: Date, to: Date): Promise<PipelineStatusBreakdown | null> {
  const mappings = await listPipelineRoleMappings(locationId);
  if (mappings.length === 0) return null;

  const aprobadas: StatusBreakdownBucket = { plus: 0, general: 0 };
  const abandonados: StatusBreakdownBucket = { plus: 0, general: 0 };
  const canceladas: StatusBreakdownBucket = { plus: 0, general: 0 };
  const ticketsEmitidos: StatusBreakdownBucket = { plus: 0, general: 0 };
  let recoveryTotal = 0;
  let recoveryRecovered = 0;

  await Promise.all(
    mappings.map(async (mapping) => {
      const opportunities = await prisma.opportunity.findMany({
        where: { locationId, ghlCreatedAt: { gte: from, lte: to }, pipelineStage: { ghlPipelineId: mapping.ghlPipelineId } },
        select: { pipelineStage: { select: { stageName: true } } },
      });

      for (const opp of opportunities) {
        const stageName = opp.pipelineStage?.stageName ?? '';
        if (mapping.role === 'compras') {
          if (LOST_HINT.test(stageName) || REFUND_HINT.test(stageName)) continue; // reembolsado/perdido — not a live approved sale
          if (CASH_TICKET_HINT.test(stageName)) ticketsEmitidos[mapping.tier]++;
          else aprobadas[mapping.tier]++;
        } else {
          const bucket = mapping.role === 'canceladas' ? canceladas : abandonados;
          bucket[mapping.tier]++;
          recoveryTotal++;
          if (RECOVERED_HINT.test(stageName)) recoveryRecovered++;
        }
      }
    }),
  );

  return {
    aprobadas,
    abandonados,
    canceladas,
    ticketsEmitidos,
    recovery: { total: recoveryTotal, recuperados: recoveryRecovered, pendientes: recoveryTotal - recoveryRecovered },
  };
}

export interface PipelineSalesKpis {
  comprasAprobadas: number;
  upgradesVip: number;
  orderBumps: number;
  leadsGestionados: number;
  ticketPromedio: number;
  ingresoBruto: number;
  netoProductor: number;
  ingresoPorUpgrade: number;
  ingresoPorBumps: number;
  pendientePorCobrar: number;
  reembolsosYDisputas: number;
}

/**
 * The "Ventas del lanzamiento" KPI row, sourced from the same mapped
 * "compras" pipelines as getPipelineStatusBreakdown — added after
 * confirming those two sections had drifted apart (statusBreakdown was
 * fixed to read from pipelines, but this row was still reading from the
 * empty Hotmart table, so half the dashboard showed real numbers and the
 * other half showed $0). No Hotmart-specific concepts (upgrade/order bump
 * as a separate purchase type) exist in this pipeline model, so those stay
 * 0 — that's an accurate reflection of this client's flow, not a bug.
 */
export async function getPipelineSalesKpis(locationId: string, from: Date, to: Date): Promise<PipelineSalesKpis | null> {
  const mappings = (await listPipelineRoleMappings(locationId)).filter((m) => m.role === 'compras');
  if (mappings.length === 0) return null;

  let comprasAprobadas = 0;
  let ingresoBruto = 0;
  let pendientePorCobrar = 0;
  let reembolsosYDisputas = 0;

  await Promise.all(
    mappings.map(async (mapping) => {
      const opportunities = await prisma.opportunity.findMany({
        where: { locationId, ghlCreatedAt: { gte: from, lte: to }, pipelineStage: { ghlPipelineId: mapping.ghlPipelineId } },
        select: { monetaryValue: true, pipelineStage: { select: { stageName: true } } },
      });
      for (const opp of opportunities) {
        const stageName = opp.pipelineStage?.stageName ?? '';
        const value = Number(opp.monetaryValue ?? 0);
        if (REFUND_HINT.test(stageName)) {
          reembolsosYDisputas += value;
        } else if (LOST_HINT.test(stageName)) {
          // churned before paying — excluded from every total, not a refund
        } else if (CASH_TICKET_HINT.test(stageName)) {
          pendientePorCobrar += value;
        } else {
          comprasAprobadas++;
          ingresoBruto += value;
        }
      }
    }),
  );

  const leadsGestionados = await prisma.contact.count({ where: { locationId, ownerGhlId: { not: null }, ghlCreatedAt: { gte: from, lte: to } } });

  return {
    comprasAprobadas,
    upgradesVip: 0,
    orderBumps: 0,
    leadsGestionados,
    ticketPromedio: comprasAprobadas > 0 ? Math.round((ingresoBruto / comprasAprobadas) * 100) / 100 : 0,
    ingresoBruto,
    netoProductor: ingresoBruto,
    ingresoPorUpgrade: 0,
    ingresoPorBumps: 0,
    pendientePorCobrar,
    reembolsosYDisputas: -reembolsosYDisputas,
  };
}

export interface PipelineSalesRankingRow {
  ownerGhlId: string;
  name: string;
  leads: number;
  compras: number;
  upgrades: number;
  bumps: number;
  ingresoNeto: number;
  conversionPct: number;
}

/**
 * Ranking por asesor sourced from pipelines — simpler than the Hotmart
 * version (launchSales.ts's getLaunchSalesRanking), which has to attribute
 * a sale to an asesor by matching the buyer's email back to a GHL Contact.
 * Here the Opportunity already carries `ownerGhlId` directly, no email
 * matching needed.
 */
export async function getPipelineSalesRanking(locationId: string, from: Date, to: Date): Promise<PipelineSalesRankingRow[] | null> {
  const mappings = (await listPipelineRoleMappings(locationId)).filter((m) => m.role === 'compras');
  if (mappings.length === 0) return null;

  const [ghlUsers, leadCounts] = await Promise.all([
    prisma.ghlUser.findMany({ where: { locationId } }),
    prisma.contact.groupBy({
      by: ['ownerGhlId'],
      where: { locationId, ownerGhlId: { not: null }, ghlCreatedAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
  ]);
  const nameByOwner = new Map(ghlUsers.map((u) => [u.ghlUserId, u.name]));
  const leadsByOwner = new Map(leadCounts.map((r) => [r.ownerGhlId!, r._count._all]));

  const byOwner = new Map<string, { compras: number; ingresoNeto: number }>();

  await Promise.all(
    mappings.map(async (mapping) => {
      const opportunities = await prisma.opportunity.findMany({
        where: { locationId, ghlCreatedAt: { gte: from, lte: to }, pipelineStage: { ghlPipelineId: mapping.ghlPipelineId }, ownerGhlId: { not: null } },
        select: { ownerGhlId: true, monetaryValue: true, pipelineStage: { select: { stageName: true } } },
      });
      for (const opp of opportunities) {
        const stageName = opp.pipelineStage?.stageName ?? '';
        if (LOST_HINT.test(stageName) || REFUND_HINT.test(stageName) || CASH_TICKET_HINT.test(stageName)) continue;
        const acc = byOwner.get(opp.ownerGhlId!) ?? { compras: 0, ingresoNeto: 0 };
        acc.compras++;
        acc.ingresoNeto += Number(opp.monetaryValue ?? 0);
        byOwner.set(opp.ownerGhlId!, acc);
      }
    }),
  );

  return Array.from(byOwner.entries())
    .map(([ownerGhlId, acc]) => {
      const leads = leadsByOwner.get(ownerGhlId) ?? 0;
      return {
        ownerGhlId,
        name: nameByOwner.get(ownerGhlId) ?? ownerGhlId,
        leads,
        compras: acc.compras,
        upgrades: 0,
        bumps: 0,
        ingresoNeto: acc.ingresoNeto,
        conversionPct: leads > 0 ? Math.round((acc.compras / leads) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.ingresoNeto - a.ingresoNeto);
}
