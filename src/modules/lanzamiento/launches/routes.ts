import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../../middleware/auth.js';
import { assertOwnedLocation, NotFoundError } from '../../../lib/authz.js';
import { prisma } from '../../../db/prisma.js';
import {
  createAttendanceRule,
  createLaunch,
  createLaunchPhase,
  deleteAttendanceRule,
  deleteLaunch,
  deleteLaunchPhase,
  getLaunchSummary,
  listAttendanceRules,
  listLaunchPhases,
  listLaunches,
  updateLaunch,
} from './service.js';

export const launchesRouter = Router();

launchesRouter.use(requireAuth);

async function assertOwnedLaunch(tenantId: string, launchId: string) {
  const launch = await prisma.launch.findFirst({ where: { id: launchId, location: { tenantId } } });
  if (!launch) throw new NotFoundError('Launch not found for this tenant');
  return launch;
}

const listQuerySchema = z.object({ locationId: z.string().min(1) });

launchesRouter.get('/', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const launches = await listLaunches(q.locationId);
    res.json({ launches });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: z.enum(['planned', 'active', 'closed']).optional(),
});

launchesRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    const launch = await createLaunch(input.locationId, {
      name: input.name,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      status: input.status,
    });
    res.status(201).json({ launch });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['planned', 'active', 'closed']).optional(),
});

launchesRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    const launch = await updateLaunch(input.locationId, req.params.id!, {
      name: input.name,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      status: input.status,
    });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });
    res.json({ launch });
  } catch (err) {
    next(err);
  }
});

launchesRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);
    const ok = await deleteLaunch(q.locationId, req.params.id!);
    if (!ok) return res.status(404).json({ error: 'Launch not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const summaryQuerySchema = z.object({ locationId: z.string().min(1), phaseId: z.string().min(1).optional() });

launchesRouter.get('/:id/summary', async (req, res, next) => {
  try {
    const q = summaryQuerySchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    let window: { from: Date; to: Date } | undefined;
    if (q.phaseId) {
      const phase = await prisma.launchPhase.findFirst({ where: { id: q.phaseId, launchId: req.params.id } });
      if (!phase) return res.status(404).json({ error: 'Phase not found' });
      window = { from: phase.startDate, to: phase.endDate };
    }

    const summary = await getLaunchSummary(req.auth!.tenantId, q.locationId, req.params.id!, window);
    if (!summary) return res.status(404).json({ error: 'Launch not found' });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

launchesRouter.get('/:id/phases', async (req, res, next) => {
  try {
    await assertOwnedLaunch(req.auth!.tenantId, req.params.id!);
    const phases = await listLaunchPhases(req.params.id!);
    res.json({ phases });
  } catch (err) {
    next(err);
  }
});

const phaseSchema = z.object({
  label: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  position: z.number().int().optional(),
});

launchesRouter.post('/:id/phases', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    await assertOwnedLaunch(req.auth!.tenantId, req.params.id!);
    const input = phaseSchema.parse(req.body);
    const phase = await createLaunchPhase(req.params.id!, { ...input, startDate: new Date(input.startDate), endDate: new Date(input.endDate) });
    res.status(201).json({ phase });
  } catch (err) {
    next(err);
  }
});

launchesRouter.delete('/:id/phases/:phaseId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    await assertOwnedLaunch(req.auth!.tenantId, req.params.id!);
    const ok = await deleteLaunchPhase(req.params.id!, req.params.phaseId!);
    if (!ok) return res.status(404).json({ error: 'Phase not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

launchesRouter.get('/:id/attendance-rules', async (req, res, next) => {
  try {
    await assertOwnedLaunch(req.auth!.tenantId, req.params.id!);
    const rules = await listAttendanceRules(req.params.id!);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

const attendanceRuleSchema = z
  .object({
    label: z.string().min(1),
    matchType: z.enum(['tag', 'form']),
    tagName: z.string().min(1).optional(),
    formName: z.string().min(1).optional(),
    position: z.number().int().optional(),
  })
  .refine((v) => (v.matchType === 'tag' ? !!v.tagName : !!v.formName), {
    message: 'tagName is required when matchType is tag, formName when matchType is form',
  });

launchesRouter.post('/:id/attendance-rules', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    await assertOwnedLaunch(req.auth!.tenantId, req.params.id!);
    const input = attendanceRuleSchema.parse(req.body);
    const rule = await createAttendanceRule(req.params.id!, input);
    res.status(201).json({ rule });
  } catch (err) {
    next(err);
  }
});

launchesRouter.delete('/:id/attendance-rules/:ruleId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    await assertOwnedLaunch(req.auth!.tenantId, req.params.id!);
    const ok = await deleteAttendanceRule(req.params.id!, req.params.ruleId!);
    if (!ok) return res.status(404).json({ error: 'Attendance rule not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
