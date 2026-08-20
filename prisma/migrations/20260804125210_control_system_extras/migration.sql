-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "dailyCallGoal" INTEGER,
ADD COLUMN     "triggerKeywordPriceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggerNoOfferClosedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggerRescheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggerStaleChatEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyMeetingGoal" INTEGER;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "aiCompanyContext" TEXT,
ADD COLUMN     "aiEvaluationInstructions" TEXT;

-- CreateTable
CREATE TABLE "tenant_metric_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'Número',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_metric_definitions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tenant_metric_definitions" ADD CONSTRAINT "tenant_metric_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
