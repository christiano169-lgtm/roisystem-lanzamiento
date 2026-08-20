import type { ObjectionCategory } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { getTenantOpenAiClient } from './tenantAiSettings.js';
import { writeBackQualityAnalysis } from './writeback.js';
import type { QualitySourceChannel } from '../../jobs/queue.js';

const OBJECTION_CATEGORIES: ObjectionCategory[] = ['precio', 'tiempo', 'competencia', 'confianza', 'necesidad', 'otro'];

const SALES_COACH_SYSTEM_PROMPT = `Eres un coach de ventas profesional que audita conversaciones comerciales
(llamadas, videollamadas o chats) entre un asesor/closer y un lead. Tu trabajo es evaluar la conversación con
el mismo criterio que un director comercial exigente: qué tan interesado se mostró el lead, qué tan bien
ejecutó el asesor el proceso de venta, qué objeciones aparecieron, y qué debería mejorar el asesor la próxima
vez. Sé específico y accionable — nada de generalidades vacías tipo "sé más empático". Responde siempre en
español, en el formato JSON solicitado.`;

interface AnalysisObjection {
  category: ObjectionCategory;
  detail: string;
}

interface AnalysisResult {
  interestScorePct: number;
  qualityScore: number;
  objections: AnalysisObjection[];
  summary: string;
  improvementNotes: string;
}

const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    interestScorePct: { type: 'integer', minimum: 0, maximum: 100, description: 'Qué tan interesado se mostró el lead en la conversación, 0-100.' },
    qualityScore: { type: 'number', minimum: 0, maximum: 10, description: 'Calidad general de la ejecución del asesor, 0-10.' },
    objections: {
      type: 'array',
      description: 'Objeciones del lead detectadas en la conversación, cada una clasificada en una categoría fija.',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: OBJECTION_CATEGORIES, description: 'Categoría fija de la objeción.' },
          detail: { type: 'string', description: 'Frase concreta de la objeción tal como la dijo el lead, en 1 línea.' },
        },
        required: ['category', 'detail'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string', description: 'Resumen de 2-3 líneas de la conversación.' },
    improvementNotes: { type: 'string', description: '2-3 aspectos concretos de mejora para el asesor, como los daría un coach de ventas.' },
  },
  required: ['interestScorePct', 'qualityScore', 'objections', 'summary', 'improvementNotes'],
  additionalProperties: false,
};

async function analyzeTranscript(
  tenantId: string,
  input: { channel: QualitySourceChannel; transcriptText: string; contextHint?: string },
): Promise<{ result: AnalysisResult; model: string; raw: unknown }> {
  const { client, model } = await getTenantOpenAiClient(tenantId);

  const channelLabel = { call: 'llamada telefónica', video_call: 'videollamada', chat: 'chat' }[input.channel];
  const userPrompt = [
    `Canal: ${channelLabel}.`,
    input.contextHint ? `Contexto: ${input.contextHint}.` : null,
    'Transcripción / historial de mensajes:',
    input.transcriptText,
  ]
    .filter(Boolean)
    .join('\n\n');

  // Control del sistema — "Contexto de empresa" / "Evaluación" let a tenant
  // extend the base coach prompt without forking it per-tenant in code.
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { aiCompanyContext: true, aiEvaluationInstructions: true } });
  const systemPrompt = [
    SALES_COACH_SYSTEM_PROMPT,
    tenant?.aiCompanyContext ? `Contexto de la empresa que estás auditando: ${tenant.aiCompanyContext}` : null,
    tenant?.aiEvaluationInstructions ? `Instrucciones adicionales de evaluación de esta agencia: ${tenant.aiEvaluationInstructions}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'sales_quality_analysis', strict: true, schema: RESPONSE_SCHEMA },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty quality-analysis response');

  return { result: JSON.parse(content) as AnalysisResult, model, raw: response };
}

/**
 * Loads the transcript + context for a given source, runs the LLM analysis,
 * upserts QualityAnalysis, and — if the tenant opted in
 * (`Tenant.aiWriteBackEnabled`) — writes an interest/objection tag and a
 * summary note back onto the GHL contact (see writeback.ts).
 */
export async function runQualityAnalysis(tenantId: string, channel: QualitySourceChannel, sourceId: string) {
  const row =
    channel === 'call'
      ? await analyzeCall(tenantId, sourceId)
      : channel === 'video_call'
        ? await analyzeVideoCall(tenantId, sourceId)
        : await analyzeChat(tenantId, sourceId);

  if (row) await writeBackQualityAnalysis(tenantId, row);
  return row;
}

async function analyzeCall(tenantId: string, callId: string) {
  const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
  if (!call.transcript) {
    logger.warn({ callId }, 'Skipping call quality analysis: no transcript yet');
    return null;
  }

  const { result, model, raw } = await analyzeTranscript(tenantId, { channel: 'call', transcriptText: call.transcript });

  return prisma.qualityAnalysis.upsert({
    where: { callId },
    create: buildAnalysisRow({ locationId: call.locationId, channel: 'call', ownerGhlId: call.ownerGhlId, callId }, result, model, raw),
    update: buildAnalysisRow({ locationId: call.locationId, channel: 'call', ownerGhlId: call.ownerGhlId, callId }, result, model, raw),
  });
}

async function analyzeVideoCall(tenantId: string, videoCallId: string) {
  const videoCall = await prisma.videoCall.findUniqueOrThrow({ where: { id: videoCallId } });
  if (!videoCall.transcript) {
    logger.warn({ videoCallId }, 'Skipping video call quality analysis: no transcript from Fathom');
    return null;
  }

  const { result, model, raw } = await analyzeTranscript(tenantId, {
    channel: 'video_call',
    transcriptText: videoCall.transcript,
    contextHint: videoCall.title ?? undefined,
  });

  return prisma.qualityAnalysis.upsert({
    where: { videoCallId },
    create: buildAnalysisRow({ locationId: videoCall.locationId, channel: 'video_call', ownerGhlId: videoCall.ownerGhlId, videoCallId }, result, model, raw),
    update: buildAnalysisRow({ locationId: videoCall.locationId, channel: 'video_call', ownerGhlId: videoCall.ownerGhlId, videoCallId }, result, model, raw),
  });
}

async function analyzeChat(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { messages: { orderBy: { ghlCreatedAt: 'asc' } } },
  });
  if (conversation.messages.length === 0) {
    logger.warn({ conversationId }, 'Skipping chat quality analysis: no messages synced yet');
    return null;
  }

  // Assumes GHL's documented 'inbound'/'outbound' values for Message.direction
  // (same assumption family as the call/appointment status constants in
  // src/modules/kpis/service.ts) — verify once real synced data is available.
  const transcriptText = conversation.messages
    .map((m) => `${m.direction === 'inbound' ? 'Lead' : 'Asesor'}: ${m.body ?? ''}`)
    .join('\n');

  const { result, model, raw } = await analyzeTranscript(tenantId, { channel: 'chat', transcriptText });

  return prisma.qualityAnalysis.upsert({
    where: { conversationId },
    create: buildAnalysisRow({ locationId: conversation.locationId, channel: 'chat', ownerGhlId: conversation.ownerGhlId, conversationId }, result, model, raw),
    update: buildAnalysisRow({ locationId: conversation.locationId, channel: 'chat', ownerGhlId: conversation.ownerGhlId, conversationId }, result, model, raw),
  });
}

function buildAnalysisRow(
  ids: { locationId: string; channel: QualitySourceChannel; ownerGhlId: string | null; callId?: string; videoCallId?: string; conversationId?: string },
  result: AnalysisResult,
  model: string,
  raw: unknown,
) {
  return {
    locationId: ids.locationId,
    channel: ids.channel,
    ownerGhlId: ids.ownerGhlId,
    callId: ids.callId,
    videoCallId: ids.videoCallId,
    conversationId: ids.conversationId,
    interestScorePct: result.interestScorePct,
    qualityScore: result.qualityScore,
    objections: result.objections.map((o) => o.detail),
    objectionCategories: result.objections.map((o) => o.category),
    summary: result.summary,
    improvementNotes: result.improvementNotes,
    model,
    analyzedAt: new Date(),
    raw: raw as object,
  };
}
