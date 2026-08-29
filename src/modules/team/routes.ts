import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { hashPassword } from '../auth/passwords.js';

export const teamRouter = Router();

teamRouter.use(requireAuth);

const SAFE_SELECT = { id: true, email: true, username: true, role: true, ghlUserId: true, allowedPages: true, createdAt: true } as const;

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
  username: z.string().min(3).optional(),
  password: z.string().min(8),
  role: z.enum(['admin', 'manager', 'asesor']),
  ghlUserId: z.string().min(1).optional(),
  // Empty/omitted = unrestricted (see prisma schema comment on User.allowedPages).
  allowedPages: z.array(z.string()).optional(),
});

/** Admin picks the teammate's initial password and hands it off manually — same no-invite-email pattern as platform/service.ts's createTenantForClient. */
teamRouter.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const existing = await prisma.user.findFirst({ where: { tenantId: req.auth!.tenantId, email: input.email } });
    if (existing) return res.status(409).json({ error: 'Ya existe un usuario con ese email en esta agencia.' });
    if (input.username) {
      const usernameTaken = await prisma.user.findFirst({ where: { username: input.username } });
      if (usernameTaken) return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        tenantId: req.auth!.tenantId,
        email: input.email,
        username: input.username,
        passwordHash,
        role: input.role,
        ghlUserId: input.ghlUserId,
        allowedPages: input.allowedPages ?? [],
      },
      select: SAFE_SELECT,
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  role: z.enum(['admin', 'manager', 'asesor']).optional(),
  allowedPages: z.array(z.string()).optional(),
  ghlUserId: z.string().min(1).nullable().optional(),
});

/** Lets an admin change a teammate's role and/or which nav pages they can see (only enforced for role `asesor`, see prisma schema). */
teamRouter.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.allowedPages !== undefined ? { allowedPages: input.allowedPages } : {}),
        ...(input.ghlUserId !== undefined ? { ghlUserId: input.ghlUserId } : {}),
      },
      select: SAFE_SELECT,
    });
    res.json({ user });
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
