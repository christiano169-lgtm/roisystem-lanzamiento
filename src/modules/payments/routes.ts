import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { assertOwnedLocation, NotFoundError } from '../../lib/authz.js';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

const createPaymentSchema = z.object({
  opportunityId: z.string().min(1),
  amount: z.coerce.number().positive(),
  collectedAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

/**
 * Manual "cash collected" entry — see prisma/schema.prisma `Payment` model
 * doc comment. Not synced from any payment gateway; this is the stopgap
 * until Stripe/GHL Payments is wired up.
 */
paymentsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const input = createPaymentSchema.parse(req.body);

    const opportunity = await prisma.opportunity.findUnique({ where: { id: input.opportunityId } });
    if (!opportunity) throw new NotFoundError('Opportunity not found');
    await assertOwnedLocation(req.auth!.tenantId, opportunity.locationId);

    const payment = await prisma.payment.create({
      data: {
        locationId: opportunity.locationId,
        opportunityId: opportunity.id,
        amount: input.amount,
        collectedAt: new Date(input.collectedAt),
        note: input.note,
        createdByUserId: req.auth!.sub,
      },
    });

    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
});

const listPaymentsSchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

paymentsRouter.get('/', async (req, res, next) => {
  try {
    const q = listPaymentsSchema.parse(req.query);
    await assertOwnedLocation(req.auth!.tenantId, q.locationId);

    const payments = await prisma.payment.findMany({
      where: {
        locationId: q.locationId,
        ...(q.from || q.to
          ? { collectedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
          : {}),
      },
      include: { opportunity: { select: { name: true, ownerGhlId: true } } },
      orderBy: { collectedAt: 'desc' },
    });

    res.json({ payments });
  } catch (err) {
    next(err);
  }
});
