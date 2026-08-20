-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'manager', 'asesor');

-- CreateEnum
CREATE TYPE "BusinessLine" AS ENUM ('high_ticket', 'lanzamiento');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'syncing', 'synced', 'error');

-- CreateEnum
CREATE TYPE "InterestBucket" AS ENUM ('alto', 'medio', 'bajo');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('not_applicable', 'pending', 'processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "QualityChannel" AS ENUM ('call', 'video_call', 'chat');

-- CreateEnum
CREATE TYPE "SyncEntity" AS ENUM ('contacts', 'opportunities', 'appointments', 'conversations');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "openAiKeyCipher" TEXT,
    "openAiModel" TEXT,
    "aiWriteBackEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'asesor',
    "ghlUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ghl_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ghlCompanyId" TEXT NOT NULL,
    "accessTokenCipher" TEXT NOT NULL,
    "refreshTokenCipher" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ghl_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ghlLocationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessLine" "BusinessLine" NOT NULL DEFAULT 'high_ticket',
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'pending',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ads_connections" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "accessTokenCipher" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_ads_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_ad_insights" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_ad_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotmart_connections" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretCipher" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotmart_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotmart_sales" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productName" TEXT,
    "buyerEmail" TEXT,
    "priceValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "status" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotmart_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_automation_rules" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "interestBucket" "InterestBucket" NOT NULL,
    "targetStageId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fathom_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "apiKeyCipher" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fathom_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_calls" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "closerUserId" TEXT NOT NULL,
    "ownerGhlId" TEXT,
    "contactGhlId" TEXT,
    "fathomMeetingId" TEXT NOT NULL,
    "title" TEXT,
    "recordingUrl" TEXT,
    "transcript" TEXT,
    "durationSeconds" INTEGER,
    "occurredAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ghl_users" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ghl_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "ownerGhlId" TEXT,
    "source" TEXT,
    "ghlCreatedAt" TIMESTAMP(3),
    "ghlUpdatedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlPipelineId" TEXT NOT NULL,
    "ghlStageId" TEXT NOT NULL,
    "pipelineName" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "contactId" TEXT,
    "pipelineStageId" TEXT,
    "name" TEXT,
    "monetaryValue" DECIMAL(14,2),
    "status" TEXT,
    "ownerGhlId" TEXT,
    "ghlCreatedAt" TIMESTAMP(3),
    "ghlUpdatedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "contactGhlId" TEXT,
    "ownerGhlId" TEXT,
    "direction" TEXT,
    "status" TEXT,
    "durationSeconds" INTEGER,
    "recordingUrl" TEXT,
    "transcript" TEXT,
    "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'not_applicable',
    "ghlCreatedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "contactGhlId" TEXT,
    "ownerGhlId" TEXT,
    "title" TEXT,
    "status" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "contactGhlId" TEXT,
    "ownerGhlId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "direction" TEXT,
    "messageType" TEXT,
    "body" TEXT,
    "ghlCreatedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_analyses" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "channel" "QualityChannel" NOT NULL,
    "ownerGhlId" TEXT,
    "callId" TEXT,
    "videoCallId" TEXT,
    "conversationId" TEXT,
    "interestScorePct" INTEGER NOT NULL,
    "qualityScore" DECIMAL(3,1) NOT NULL,
    "objections" JSONB NOT NULL,
    "summary" TEXT,
    "improvementNotes" TEXT,
    "model" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB NOT NULL,

    CONSTRAINT "quality_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "entity" "SyncEntity" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "cursor" TEXT,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ghl_connections_tenantId_key" ON "ghl_connections"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_tenantId_ghlLocationId_key" ON "locations"("tenantId", "ghlLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ads_connections_locationId_key" ON "meta_ads_connections"("locationId");

-- CreateIndex
CREATE INDEX "meta_ad_insights_locationId_date_idx" ON "meta_ad_insights"("locationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meta_ad_insights_locationId_campaignId_date_key" ON "meta_ad_insights"("locationId", "campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "hotmart_connections_locationId_key" ON "hotmart_connections"("locationId");

-- CreateIndex
CREATE INDEX "hotmart_sales_locationId_purchaseDate_idx" ON "hotmart_sales"("locationId", "purchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "hotmart_sales_locationId_transactionId_key" ON "hotmart_sales"("locationId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "stage_automation_rules_locationId_interestBucket_key" ON "stage_automation_rules"("locationId", "interestBucket");

-- CreateIndex
CREATE UNIQUE INDEX "fathom_connections_userId_key" ON "fathom_connections"("userId");

-- CreateIndex
CREATE INDEX "video_calls_locationId_occurredAt_idx" ON "video_calls"("locationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "video_calls_closerUserId_fathomMeetingId_key" ON "video_calls"("closerUserId", "fathomMeetingId");

-- CreateIndex
CREATE UNIQUE INDEX "ghl_users_locationId_ghlUserId_key" ON "ghl_users"("locationId", "ghlUserId");

-- CreateIndex
CREATE INDEX "contacts_locationId_ghlCreatedAt_idx" ON "contacts"("locationId", "ghlCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_locationId_ghlId_key" ON "contacts"("locationId", "ghlId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_locationId_name_key" ON "tags"("locationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_locationId_ghlPipelineId_ghlStageId_key" ON "pipeline_stages"("locationId", "ghlPipelineId", "ghlStageId");

-- CreateIndex
CREATE INDEX "opportunities_locationId_ghlCreatedAt_idx" ON "opportunities"("locationId", "ghlCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_locationId_ghlId_key" ON "opportunities"("locationId", "ghlId");

-- CreateIndex
CREATE INDEX "payments_locationId_collectedAt_idx" ON "payments"("locationId", "collectedAt");

-- CreateIndex
CREATE INDEX "calls_locationId_ghlCreatedAt_idx" ON "calls"("locationId", "ghlCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "calls_locationId_ghlId_key" ON "calls"("locationId", "ghlId");

-- CreateIndex
CREATE INDEX "appointments_locationId_startTime_idx" ON "appointments"("locationId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_locationId_ghlId_key" ON "appointments"("locationId", "ghlId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_locationId_ghlId_key" ON "conversations"("locationId", "ghlId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversationId_ghlId_key" ON "messages"("conversationId", "ghlId");

-- CreateIndex
CREATE UNIQUE INDEX "quality_analyses_callId_key" ON "quality_analyses"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "quality_analyses_videoCallId_key" ON "quality_analyses"("videoCallId");

-- CreateIndex
CREATE UNIQUE INDEX "quality_analyses_conversationId_key" ON "quality_analyses"("conversationId");

-- CreateIndex
CREATE INDEX "quality_analyses_locationId_ownerGhlId_idx" ON "quality_analyses"("locationId", "ownerGhlId");

-- CreateIndex
CREATE INDEX "sync_jobs_locationId_entity_status_idx" ON "sync_jobs"("locationId", "entity", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ghl_connections" ADD CONSTRAINT "ghl_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ads_connections" ADD CONSTRAINT "meta_ads_connections_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_ad_insights" ADD CONSTRAINT "meta_ad_insights_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotmart_connections" ADD CONSTRAINT "hotmart_connections_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotmart_sales" ADD CONSTRAINT "hotmart_sales_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_automation_rules" ADD CONSTRAINT "stage_automation_rules_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_automation_rules" ADD CONSTRAINT "stage_automation_rules_targetStageId_fkey" FOREIGN KEY ("targetStageId") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fathom_connections" ADD CONSTRAINT "fathom_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fathom_connections" ADD CONSTRAINT "fathom_connections_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_calls" ADD CONSTRAINT "video_calls_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_calls" ADD CONSTRAINT "video_calls_closerUserId_fkey" FOREIGN KEY ("closerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ghl_users" ADD CONSTRAINT "ghl_users_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipelineStageId_fkey" FOREIGN KEY ("pipelineStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_analyses" ADD CONSTRAINT "quality_analyses_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_analyses" ADD CONSTRAINT "quality_analyses_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_analyses" ADD CONSTRAINT "quality_analyses_videoCallId_fkey" FOREIGN KEY ("videoCallId") REFERENCES "video_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_analyses" ADD CONSTRAINT "quality_analyses_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
