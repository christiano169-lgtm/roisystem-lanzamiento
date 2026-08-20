import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { env } from '../config/env.js';

export const redisConnection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

// --- GHL location backfill (Fase 1) -----------------------------------------

export interface BackfillJobData {
  tenantId: string;
  locationId: string;
}

export const SYNC_QUEUE_NAME = 'ghl-location-backfill';

export const syncQueue = new Queue<BackfillJobData>(SYNC_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export function enqueueLocationBackfill(data: BackfillJobData) {
  return syncQueue.add('backfill', data, { jobId: `backfill:${data.locationId}:${Date.now()}` });
}

// --- Whisper transcription of GHL calls (Fase 3) ----------------------------

export interface TranscriptionJobData {
  tenantId: string;
  callId: string;
}

export const TRANSCRIPTION_QUEUE_NAME = 'call-transcription';

export const transcriptionQueue = new Queue<TranscriptionJobData>(TRANSCRIPTION_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export function enqueueCallTranscription(data: TranscriptionJobData) {
  // Deduplicated by callId: re-syncing the same call before the job runs
  // shouldn't pile up duplicate transcription attempts.
  return transcriptionQueue.add('transcribe', data, { jobId: `transcribe:${data.callId}` });
}

// --- AI quality analysis (Fase 3) -------------------------------------------

export type QualitySourceChannel = 'call' | 'video_call' | 'chat';

export interface QualityAnalysisJobData {
  tenantId: string;
  channel: QualitySourceChannel;
  sourceId: string; // Call.id | VideoCall.id | Conversation.id, depending on channel
}

export const QUALITY_ANALYSIS_QUEUE_NAME = 'quality-analysis';

export const qualityAnalysisQueue = new Queue<QualityAnalysisJobData>(QUALITY_ANALYSIS_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export function enqueueQualityAnalysis(data: QualityAnalysisJobData) {
  // Deduplicated by channel+sourceId: analysis upserts a single "current"
  // QualityAnalysis row per source anyway (see prisma schema), so piling up
  // repeat jobs for the same source before the first one runs is wasted work.
  return qualityAnalysisQueue.add('analyze', data, { jobId: `analyze:${data.channel}:${data.sourceId}` });
}

// --- Per-closer Fathom sync (Fase 3) ----------------------------------------

export interface FathomSyncJobData {
  tenantId: string;
  fathomConnectionId: string;
}

export const FATHOM_SYNC_QUEUE_NAME = 'fathom-sync';

export const fathomSyncQueue = new Queue<FathomSyncJobData>(FATHOM_SYNC_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export function enqueueFathomSync(data: FathomSyncJobData) {
  return fathomSyncQueue.add('sync', data, { jobId: `fathom-sync:${data.fathomConnectionId}:${Date.now()}` });
}

// --- Meta Ads sync (Fase 3.5) ------------------------------------------------

export interface MetaAdsSyncJobData {
  tenantId: string;
  locationId: string;
}

export const META_ADS_SYNC_QUEUE_NAME = 'meta-ads-sync';

export const metaAdsSyncQueue = new Queue<MetaAdsSyncJobData>(META_ADS_SYNC_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export function enqueueMetaAdsSync(data: MetaAdsSyncJobData) {
  return metaAdsSyncQueue.add('sync', data, { jobId: `meta-ads-sync:${data.locationId}:${Date.now()}` });
}

// --- Hotmart sync (Fase 3.5) -------------------------------------------------

export interface HotmartSyncJobData {
  tenantId: string;
  locationId: string;
}

export const HOTMART_SYNC_QUEUE_NAME = 'hotmart-sync';

export const hotmartSyncQueue = new Queue<HotmartSyncJobData>(HOTMART_SYNC_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions,
});

export function enqueueHotmartSync(data: HotmartSyncJobData) {
  return hotmartSyncQueue.add('sync', data, { jobId: `hotmart-sync:${data.locationId}:${Date.now()}` });
}
