-- CreateEnum
CREATE TYPE "PipelineRole" AS ENUM ('compras', 'canceladas', 'abandonados');

-- CreateEnum
CREATE TYPE "PipelineTier" AS ENUM ('general', 'plus');

-- CreateTable
CREATE TABLE "pipeline_role_mappings" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "ghlPipelineId" TEXT NOT NULL,
    "pipelineName" TEXT NOT NULL,
    "role" "PipelineRole" NOT NULL,
    "tier" "PipelineTier" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_role_mappings_locationId_role_tier_key" ON "pipeline_role_mappings"("locationId", "role", "tier");

-- AddForeignKey
ALTER TABLE "pipeline_role_mappings" ADD CONSTRAINT "pipeline_role_mappings_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
