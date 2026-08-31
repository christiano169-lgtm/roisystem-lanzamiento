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
const LOST_HINT = /reembolso|perdido|cancelad/i;

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
          if (LOST_HINT.test(stageName)) continue; // reembolsado/perdido — not a live approved sale
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
