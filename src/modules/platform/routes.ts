import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePlatformAdmin } from '../../middleware/auth.js';
import { createTenantForClient, listTenantsForPlatform, updateTenantSubscription } from './service.js';

export const platformRouter = Router();

platformRouter.use(requireAuth, requirePlatformAdmin);

platformRouter.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await listTenantsForPlatform();
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
});

const createTenantSchema = z.object({
  tenantName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  subscriptionPlan: z.string().optional(),
});

platformRouter.post('/tenants', async (req, res, next) => {
  try {
    const input = createTenantSchema.parse(req.body);
    const result = await createTenantForClient(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const updateTenantSchema = z
  .object({
    subscriptionStatus: z.enum(['trial', 'active', 'overdue', 'suspended']).optional(),
    subscriptionPlan: z.string().nullable().optional(),
    subscriptionNotes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

platformRouter.patch('/tenants/:id', async (req, res, next) => {
  try {
    const input = updateTenantSchema.parse(req.body);
    const tenant = await updateTenantSubscription(req.params.id, input);
    res.json({ tenant });
  } catch (err) {
    next(err);
  }
});
