import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { hashPassword } from '../auth/passwords.js';

export const teamRouter = Router();

teamRouter.use(requireAuth);

const SAFE_SELECT = { id: true, email: true, role: true, ghlUserId: true, createdAt: true } as const;

/** Control del sistema → "Equipo y asesores". Scoped to the caller's own tenant (unlike /api/platform, which is cross-tenant and admin-of-admins only). */
teamRouter.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ where: { tenantId: req.auth!.tenantId }, select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'manager', 'asesor']),
  ghlUserId: z.string().min(1).optional(),
});

/** Admin picks the teammate's initial password and hands it off manually — same no-invite-email pattern as platform/service.ts's createTenantForClient. */
teamRouter.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const existing = await prisma.user.findFirst({ where: { tenantId: req.auth!.tenantId, email: input.email } });
    if (existing) return res.status(409).json({ error: 'Ya existe un usuario con ese email en esta agencia.' });

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { tenantId: req.auth!.tenantId, email: input.email, passwordHash, role: input.role, ghlUserId: input.ghlUserId },
      select: SAFE_SELECT,
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

teamRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.auth!.sub) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    await prisma.user.deleteMany({ where: { id: req.params.id!, tenantId: req.auth!.tenantId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
