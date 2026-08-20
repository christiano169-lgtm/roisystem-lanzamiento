import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { assertOwnedLocation } from '../../lib/authz.js';
import { saveTenantOpenAiKey } from '../quality/tenantAiSettings.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

const openAiKeySchema = z.object({
  apiKey: z.string().min(10),
  model: z.string().optional(),
});

/** Agency-wide OpenAI key (Fase 3) — used for Whisper transcription and quality analysis across every closer. */
settingsRouter.put('/openai-key', requireRole('admin'), async (req, res, next) => {
  try {
    const input = openAiKeySchema.parse(req.body);
    const tenant = await saveTenantOpenAiKey(req.auth!.tenantId, input.apiKey, input.model);
    res.json({ configured: true, model: tenant.openAiModel });
  } catch (err) {
    next(err);
  }
});

settingsRouter.get('/openai-key', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    res.json({ configured: !!tenant.openAiKeyCipher, model: tenant.openAiModel });
  } catch (err) {
    next(err);
  }
});

const aiWriteBackSchema = z.object({ enabled: z.boolean() });

/** Opt-in toggle: when on, a successful quality analysis tags + notes the GHL contact (see quality/writeback.ts). */
settingsRouter.get('/ai-writeback', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    res.json({ enabled: tenant.aiWriteBackEnabled });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put('/ai-writeback', requireRole('admin'), async (req, res, next) => {
  try {
    const input = aiWriteBackSchema.parse(req.body);
    const tenant = await prisma.tenant.update({ where: { id: req.auth!.tenantId }, data: { aiWriteBackEnabled: input.enabled } });
    res.json({ enabled: tenant.aiWriteBackEnabled });
  } catch (err) {
    next(err);
  }
});

const stageAutomationRuleSchema = z.object({
  interestBucket: z.enum(['alto', 'medio', 'bajo']),
  targetStageId: z.string().min(1).nullable(),
  enabled: z.boolean(),
});

const stageAutomationSchema = z.object({
  locationId: z.string().min(1),
  rules: z.array(stageAutomationRuleSchema),
});

/**
 * Per-Location config for the second, higher-blast-radius write-back gate:
 * "when the AI detects interest level X, move the opportunity to stage Y."
 * A `targetStageId: null` for a bucket means no rule for it (deleted).
 * Requires Tenant.aiWriteBackEnabled to actually take effect — this only
 * stores the mapping, see quality/writeback.ts for where it's applied.
 */
settingsRouter.get('/stage-automation', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    await assertOwnedLocation(req.auth!.tenantId, locationId);
    const rules = await prisma.stageAutomationRule.findMany({ where: { locationId } });
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put('/stage-automation', requireRole('admin'), async (req, res, next) => {
  try {
    const input = stageAutomationSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);

    await prisma.$transaction(
      input.rules.map((rule) =>
        rule.targetStageId
          ? prisma.stageAutomationRule.upsert({
              where: { locationId_interestBucket: { locationId: input.locationId, interestBucket: rule.interestBucket } },
              create: { locationId: input.locationId, interestBucket: rule.interestBucket, targetStageId: rule.targetStageId, enabled: rule.enabled },
              update: { targetStageId: rule.targetStageId, enabled: rule.enabled },
            })
          : prisma.stageAutomationRule.deleteMany({
              where: { locationId: input.locationId, interestBucket: rule.interestBucket },
            }),
      ),
    );

    const rules = await prisma.stageAutomationRule.findMany({ where: { locationId: input.locationId } });
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

const promptSchema = z.object({
  aiCompanyContext: z.string().max(4000).nullable().optional(),
  aiEvaluationInstructions: z.string().max(4000).nullable().optional(),
});

/** Control del sistema — appended to the quality-analysis system prompt, see quality/analyzer.ts. */
settingsRouter.get('/prompt', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.auth!.tenantId } });
    res.json({ aiCompanyContext: tenant.aiCompanyContext, aiEvaluationInstructions: tenant.aiEvaluationInstructions });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put('/prompt', requireRole('admin'), async (req, res, next) => {
  try {
    const input = promptSchema.parse(req.body);
    const tenant = await prisma.tenant.update({ where: { id: req.auth!.tenantId }, data: input });
    res.json({ aiCompanyContext: tenant.aiCompanyContext, aiEvaluationInstructions: tenant.aiEvaluationInstructions });
  } catch (err) {
    next(err);
  }
});

const goalsSchema = z.object({
  locationId: z.string().min(1),
  dailyCallGoal: z.number().int().min(0).nullable().optional(),
  weeklyMeetingGoal: z.number().int().min(0).nullable().optional(),
});

/** Control del sistema → "Metas", compared against real synced counts (see setters/service.ts, AdvisorPanel). */
settingsRouter.get('/goals', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    const location = await assertOwnedLocation(req.auth!.tenantId, locationId);
    res.json({ dailyCallGoal: location.dailyCallGoal, weeklyMeetingGoal: location.weeklyMeetingGoal });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put('/goals', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const input = goalsSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    const location = await prisma.location.update({
      where: { id: input.locationId },
      data: { dailyCallGoal: input.dailyCallGoal, weeklyMeetingGoal: input.weeklyMeetingGoal },
    });
    res.json({ dailyCallGoal: location.dailyCallGoal, weeklyMeetingGoal: location.weeklyMeetingGoal });
  } catch (err) {
    next(err);
  }
});

const triggersSchema = z.object({
  locationId: z.string().min(1),
  triggerStaleChatEnabled: z.boolean(),
  triggerKeywordPriceEnabled: z.boolean(),
  triggerRescheduleEnabled: z.boolean(),
  triggerNoOfferClosedEnabled: z.boolean(),
});

function pickTriggers(location: { triggerStaleChatEnabled: boolean; triggerKeywordPriceEnabled: boolean; triggerRescheduleEnabled: boolean; triggerNoOfferClosedEnabled: boolean }) {
  return {
    triggerStaleChatEnabled: location.triggerStaleChatEnabled,
    triggerKeywordPriceEnabled: location.triggerKeywordPriceEnabled,
    triggerRescheduleEnabled: location.triggerRescheduleEnabled,
    triggerNoOfferClosedEnabled: location.triggerNoOfferClosedEnabled,
  };
}

/** Control del sistema → "Disparadores de chat". Saved preferences only — see prisma schema doc comment on these fields for why nothing acts on them yet. */
settingsRouter.get('/triggers', async (req, res, next) => {
  try {
    const locationId = z.string().min(1).parse(req.query.locationId);
    const location = await assertOwnedLocation(req.auth!.tenantId, locationId);
    res.json(pickTriggers(location));
  } catch (err) {
    next(err);
  }
});

settingsRouter.put('/triggers', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const input = triggersSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    const location = await prisma.location.update({
      where: { id: input.locationId },
      data: {
        triggerStaleChatEnabled: input.triggerStaleChatEnabled,
        triggerKeywordPriceEnabled: input.triggerKeywordPriceEnabled,
        triggerRescheduleEnabled: input.triggerRescheduleEnabled,
        triggerNoOfferClosedEnabled: input.triggerNoOfferClosedEnabled,
      },
    });
    res.json(pickTriggers(location));
  } catch (err) {
    next(err);
  }
});

/** Control del sistema → "Métricas personalizadas" — definitions registry, see prisma TenantMetricDefinition doc comment. */
settingsRouter.get('/metrics', async (req, res, next) => {
  try {
    const metrics = await prisma.tenantMetricDefinition.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: { createdAt: 'asc' } });
    res.json({ metrics });
  } catch (err) {
    next(err);
  }
});

const createMetricSchema = z.object({ name: z.string().min(1).max(80), formula: z.string().min(1).max(200), format: z.string().min(1).max(30) });

settingsRouter.post('/metrics', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const input = createMetricSchema.parse(req.body);
    const metric = await prisma.tenantMetricDefinition.create({ data: { tenantId: req.auth!.tenantId, ...input } });
    res.status(201).json({ metric });
  } catch (err) {
    next(err);
  }
});

settingsRouter.delete('/metrics/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    await prisma.tenantMetricDefinition.deleteMany({ where: { id: req.params.id!, tenantId: req.auth!.tenantId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
