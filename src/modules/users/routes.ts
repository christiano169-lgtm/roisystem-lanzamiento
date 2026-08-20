import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth } from '../../middleware/auth.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.sub },
      select: { id: true, email: true, role: true, ghlUserId: true, tenantId: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

const linkGhlUserSchema = z.object({ ghlUserId: z.string().min(1) });

/**
 * Links this dashboard login to a GHL user id (Fase 3) — required before a
 * closer's video calls (Fathom) or calls/appointments/contacts (GHL) can be
 * attributed to them in the quality/ranking reports. Set manually: there's
 * no reliable automatic match between a dashboard account and a GHL user.
 */
usersRouter.put('/me/ghl-user', async (req, res, next) => {
  try {
    const input = linkGhlUserSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: { ghlUserId: input.ghlUserId },
      select: { id: true, email: true, role: true, ghlUserId: true },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
