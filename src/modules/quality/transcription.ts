import axios from 'axios';
import { toFile } from 'openai';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { getTenantOpenAiClient } from './tenantAiSettings.js';
import { enqueueQualityAnalysis } from '../../jobs/queue.js';
import { ghlLocationGet } from '../ghl/client.js';

interface GhlTranscriptSentence {
  sentenceIndex?: number;
  transcript?: string;
}

/**
 * GHL has its own call transcription (GET
 * /conversations/locations/{locationId}/messages/{messageId}/transcription
 * — confirmed against github.com/GoHighLevel/highlevel-api-docs, fetched
 * 2026-08-03). It's tried first since it's already paid for and usually
 * faster than downloading the recording ourselves; not every call/plan has
 * one available, so a null/empty result is expected, not an error.
 *
 * The docs show the response as a single sentence object, which can't be
 * right for a multi-sentence call — almost certainly an array in practice.
 * Handled defensively either way.
 */
async function fetchGhlNativeTranscript(tenantId: string, ghlLocationId: string, messageId: string): Promise<string | null> {
  try {
    const data = await ghlLocationGet<GhlTranscriptSentence | GhlTranscriptSentence[]>(
      tenantId,
      ghlLocationId,
      `/conversations/locations/${ghlLocationId}/messages/${messageId}/transcription`,
    );
    const sentences = Array.isArray(data) ? data : [data];
    const text = sentences
      .filter((s) => s?.transcript)
      .sort((a, b) => (a.sentenceIndex ?? 0) - (b.sentenceIndex ?? 0))
      .map((s) => s.transcript)
      .join(' ')
      .trim();
    return text || null;
  } catch (err) {
    logger.info({ err, messageId }, 'No native GHL transcription available, will fall back to Whisper');
    return null;
  }
}

async function transcribeWithWhisper(tenantId: string, recordingUrl: string): Promise<string> {
  const audio = await axios.get<ArrayBuffer>(recordingUrl, { responseType: 'arraybuffer' });
  const { client } = await getTenantOpenAiClient(tenantId);
  const file = await toFile(Buffer.from(audio.data), 'call-recording.mp3');
  const transcription = await client.audio.transcriptions.create({ file, model: 'whisper-1' });
  return transcription.text;
}

/**
 * Fills in Call.transcript — GHL's native transcription first, Whisper
 * (using the tenant's own OpenAI key) as a fallback when GHL doesn't have
 * one for this call. Feeds src/modules/quality/analyzer.ts once done —
 * phone calls get the same quality analysis as Fathom video calls.
 */
export async function transcribeCall(tenantId: string, callId: string) {
  const call = await prisma.call.findUniqueOrThrow({ where: { id: callId }, include: { location: true } });

  if (!call.recordingUrl) {
    await prisma.call.update({ where: { id: callId }, data: { transcriptStatus: 'not_applicable' } });
    return;
  }

  await prisma.call.update({ where: { id: callId }, data: { transcriptStatus: 'processing' } });

  try {
    const nativeTranscript = await fetchGhlNativeTranscript(tenantId, call.location.ghlLocationId, call.ghlId);
    const transcript = nativeTranscript ?? (await transcribeWithWhisper(tenantId, call.recordingUrl));

    await prisma.call.update({ where: { id: callId }, data: { transcript, transcriptStatus: 'done' } });
    await enqueueQualityAnalysis({ tenantId, channel: 'call', sourceId: callId });
  } catch (err) {
    logger.error({ err, callId }, 'Call transcription failed');
    await prisma.call.update({ where: { id: callId }, data: { transcriptStatus: 'failed' } });
    throw err;
  }
}
