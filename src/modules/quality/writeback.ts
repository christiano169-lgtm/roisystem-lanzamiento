import type { InterestBucket, QualityAnalysis } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { ghlLocationPost, ghlLocationPut } from '../ghl/client.js';
import type { QualitySourceChannel } from '../../jobs/queue.js';

const CHANNEL_LABEL: Record<QualitySourceChannel, string> = {
  call: 'llamada',
  video_call: 'videollamada',
  chat: 'chat',
};

/** Canonical interest bucketing — shared by the GHL tag and the stage-automation rule lookup. */
export function interestBucket(interestScorePct: number): InterestBucket {
  if (interestScorePct >= 70) return 'alto';
  if (interestScorePct >= 40) return 'medio';
  return 'bajo';
}

/** Buckets the AI's 0-100 interest score into a GHL-safe tag the tenant can build automations on. */
export function interestBucketTag(interestScorePct: number): string {
  return `ia-interes-${interestBucket(interestScorePct)}`;
}

/** Tags by the fixed category (see prisma ObjectionCategory) instead of the raw phrase, so every tenant's GHL tags stay consistent and groupable regardless of how the AI phrased the objection. */
export function objectionTag(category: string): string {
  return `objecion-${category}`;
}

export function buildWriteBackNote(analysis: {
  channel: QualitySourceChannel;
  interestScorePct: number;
  qualityScore: number;
  summary: string | null;
  improvementNotes: string | null;
}): string {
  const lines = [
    `🤖 Análisis de IA — ${CHANNEL_LABEL[analysis.channel]}`,
    `Interés del lead: ${analysis.interestScorePct}% · Calidad de la conversación: ${analysis.qualityScore}/10`,
  ];
  if (analysis.summary) lines.push('', 'Resumen:', analysis.summary);
  if (analysis.improvementNotes) lines.push('', 'Aspectos de mejora para el asesor:', analysis.improvementNotes);
  return lines.join('\n');
}

/**
 * Opt-in (Tenant.aiWriteBackEnabled) — tags the GHL contact with an
 * interest-level bucket + one tag per detected objection, and adds a note
 * with the AI's summary/improvement notes. If the tenant also configured a
 * `StageAutomationRule` for this location+bucket, moves the contact's most
 * recent open Opportunity to that pipeline stage (see `maybeMoveStage`) —
 * a second, more consequential opt-in on top of the tag/note one, since it
 * changes what the sales team sees as the deal's status.
 *
 * Never throws — a write-back failure (bad token, contact not found, GHL
 * outage) must not fail the quality-analysis job that already succeeded.
 */
export async function writeBackQualityAnalysis(tenantId: string, analysis: QualityAnalysis): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.aiWriteBackEnabled) return;

    const contactGhlId = await resolveContactGhlId(analysis);
    if (!contactGhlId) {
      logger.warn({ qualityAnalysisId: analysis.id }, 'Skipping GHL write-back: no contactGhlId on the analyzed source');
      return;
    }

    const location = await prisma.location.findUniqueOrThrow({ where: { id: analysis.locationId } });

    const tags = [interestBucketTag(analysis.interestScorePct), ...analysis.objectionCategories.slice(0, 3).map(objectionTag)];

    await ghlLocationPost(tenantId, location.ghlLocationId, `/contacts/${contactGhlId}/tags`, { tags });
    await ghlLocationPost(tenantId, location.ghlLocationId, `/contacts/${contactGhlId}/notes`, {
      body: buildWriteBackNote({
        channel: analysis.channel,
        interestScorePct: analysis.interestScorePct,
        qualityScore: Number(analysis.qualityScore),
        summary: analysis.summary,
        improvementNotes: analysis.improvementNotes,
      }),
    });

    await maybeMoveStage(tenantId, location.id, location.ghlLocationId, analysis, contactGhlId);
  } catch (err) {
    logger.error({ err, qualityAnalysisId: analysis.id }, 'GHL write-back failed');
  }
}

/**
 * "Open opportunity" is a heuristic, not a documented GHL guarantee: GHL's
 * `status` enum beyond `'open'`/`'won'` is unconfirmed (see README "Supuestos
 * de los KPIs"), so this only excludes the one status we're sure means
 * "already closed" (`won`) and picks the most recently updated match — a
 * contact with several concurrent opportunities could have the wrong one
 * moved. Documented in the README write-back section.
 */
async function maybeMoveStage(
  tenantId: string,
  locationId: string,
  ghlLocationId: string,
  analysis: QualityAnalysis,
  contactGhlId: string,
): Promise<void> {
  const bucket = interestBucket(analysis.interestScorePct);
  const rule = await prisma.stageAutomationRule.findUnique({
    where: { locationId_interestBucket: { locationId, interestBucket: bucket } },
    include: { targetStage: true },
  });
  if (!rule || !rule.enabled) return;

  const contact = await prisma.contact.findUnique({ where: { locationId_ghlId: { locationId, ghlId: contactGhlId } } });
  if (!contact) return;

  const opportunity = await prisma.opportunity.findFirst({
    where: { locationId, contactId: contact.id, status: { not: 'won' } },
    orderBy: { ghlUpdatedAt: 'desc' },
  });
  if (!opportunity) return;

  await ghlLocationPut(tenantId, ghlLocationId, `/opportunities/${opportunity.ghlId}`, {
    pipelineStageId: rule.targetStage.ghlStageId,
  });
  // Mirror locally too, so this tenant's own KPIs/funnel reflect the move
  // immediately instead of waiting for the next opportunities backfill.
  await prisma.opportunity.update({ where: { id: opportunity.id }, data: { pipelineStageId: rule.targetStageId } });
}

async function resolveContactGhlId(analysis: QualityAnalysis): Promise<string | null> {
  if (analysis.callId) {
    const call = await prisma.call.findUnique({ where: { id: analysis.callId } });
    return call?.contactGhlId ?? null;
  }
  if (analysis.videoCallId) {
    const videoCall = await prisma.videoCall.findUnique({ where: { id: analysis.videoCallId } });
    return videoCall?.contactGhlId ?? null;
  }
  if (analysis.conversationId) {
    const conversation = await prisma.conversation.findUnique({ where: { id: analysis.conversationId } });
    return conversation?.contactGhlId ?? null;
  }
  return null;
}
