import { prisma } from '../../../db/prisma.js';
import { ghlLocationGet } from '../client.js';
import type { GhlPipeline } from '../types.js';

interface GhlPipelinesResponse {
  pipelines: GhlPipeline[];
}

/**
 * Pipelines/stages are a small, low-churn list per location — synced fully
 * (no pagination) before each opportunities backfill so `PipelineStage`
 * lookups in `opportunities.ts` can resolve. Confirmed against
 * github.com/GoHighLevel/highlevel-api-docs (apps/opportunities.json):
 * `locationId` (camelCase) + `pipelines` response key, Sub-Account scoped.
 */
export async function syncPipelineStages(tenantId: string, locationId: string, ghlLocationId: string) {
  const { pipelines } = await ghlLocationGet<GhlPipelinesResponse>(tenantId, ghlLocationId, '/opportunities/pipelines', {
    locationId: ghlLocationId,
  });

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      await prisma.pipelineStage.upsert({
        where: {
          locationId_ghlPipelineId_ghlStageId: {
            locationId,
            ghlPipelineId: pipeline.id,
            ghlStageId: stage.id,
          },
        },
        create: {
          locationId,
          ghlPipelineId: pipeline.id,
          ghlStageId: stage.id,
          pipelineName: pipeline.name,
          stageName: stage.name,
          position: stage.position,
        },
        update: {
          pipelineName: pipeline.name,
          stageName: stage.name,
          position: stage.position,
        },
      });
    }
  }

  return pipelines.length;
}
