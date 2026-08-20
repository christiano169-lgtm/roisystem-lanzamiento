import { Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import {
  redisConnection,
  SYNC_QUEUE_NAME,
  TRANSCRIPTION_QUEUE_NAME,
  QUALITY_ANALYSIS_QUEUE_NAME,
  FATHOM_SYNC_QUEUE_NAME,
  META_ADS_SYNC_QUEUE_NAME,
  HOTMART_SYNC_QUEUE_NAME,
  type BackfillJobData,
  type TranscriptionJobData,
  type QualityAnalysisJobData,
  type FathomSyncJobData,
  type MetaAdsSyncJobData,
  type HotmartSyncJobData,
} from './queue.js';
import { runFullBackfillForLocation } from '../modules/ghl/sync/runner.js';
import { transcribeCall } from '../modules/quality/transcription.js';
import { runQualityAnalysis } from '../modules/quality/analyzer.js';
import { syncVideoCallsForConnection } from '../modules/fathom/sync/videoCalls.js';
import { syncMetaAdsInsights } from '../modules/lanzamiento/metaAds/sync/insights.js';
import { syncHotmartSales } from '../modules/hotmart/sync/sales.js';

// All background work runs as a separate process (`npm run worker`) so slow
// GHL backfills, Whisper transcription, LLM analysis, or Fathom syncs never
// block the API server handling everyone else's requests.

const backfillWorker = new Worker<BackfillJobData>(
  SYNC_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, locationId: job.data.locationId }, 'Starting location backfill');
    await runFullBackfillForLocation(job.data.tenantId, job.data.locationId);
  },
  { connection: redisConnection, concurrency: 3 },
);
backfillWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Location backfill completed'));
backfillWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Location backfill failed'));

const transcriptionWorker = new Worker<TranscriptionJobData>(
  TRANSCRIPTION_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, callId: job.data.callId }, 'Transcribing call recording');
    await transcribeCall(job.data.tenantId, job.data.callId);
  },
  { connection: redisConnection, concurrency: 5 },
);
transcriptionWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Call transcription completed'));
transcriptionWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Call transcription failed'));

const qualityAnalysisWorker = new Worker<QualityAnalysisJobData>(
  QUALITY_ANALYSIS_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, channel: job.data.channel, sourceId: job.data.sourceId }, 'Running quality analysis');
    await runQualityAnalysis(job.data.tenantId, job.data.channel, job.data.sourceId);
  },
  { connection: redisConnection, concurrency: 5 },
);
qualityAnalysisWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Quality analysis completed'));
qualityAnalysisWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Quality analysis failed'));

const fathomSyncWorker = new Worker<FathomSyncJobData>(
  FATHOM_SYNC_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, fathomConnectionId: job.data.fathomConnectionId }, 'Syncing Fathom video calls');
    await syncVideoCallsForConnection(job.data.tenantId, job.data.fathomConnectionId);
  },
  { connection: redisConnection, concurrency: 3 },
);
fathomSyncWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Fathom sync completed'));
fathomSyncWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Fathom sync failed'));

const metaAdsSyncWorker = new Worker<MetaAdsSyncJobData>(
  META_ADS_SYNC_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, locationId: job.data.locationId }, 'Syncing Meta Ads insights');
    await syncMetaAdsInsights(job.data.locationId);
  },
  { connection: redisConnection, concurrency: 3 },
);
metaAdsSyncWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Meta Ads sync completed'));
metaAdsSyncWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Meta Ads sync failed'));

const hotmartSyncWorker = new Worker<HotmartSyncJobData>(
  HOTMART_SYNC_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, locationId: job.data.locationId }, 'Syncing Hotmart sales');
    await syncHotmartSales(job.data.locationId);
  },
  { connection: redisConnection, concurrency: 3 },
);
hotmartSyncWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'Hotmart sync completed'));
hotmartSyncWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Hotmart sync failed'));

logger.info('Background workers started (backfill, transcription, quality analysis, fathom sync, meta ads sync, hotmart sync)');
