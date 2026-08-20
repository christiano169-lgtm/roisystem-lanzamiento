import type { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { signAuthToken } from './jwt.js';

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Shared by both entry points that create a Tenant: the one-time public
 * bootstrap (`registerFirstAdmin` below) and the platform-admin "onboard a
 * new client" flow (`src/modules/platform/service.ts`). Never called
 * directly from a route — each caller decides `isPlatformAdmin`/
 * `subscriptionStatus` for its own case.
 */
export async function createTenantWithAdmin(
  input: { tenantName: string; email: string; password: string; subscriptionPlan?: string },
  opts: { isPlatformAdmin: boolean; subscriptionStatus: SubscriptionStatus },
) {
  const existing = await prisma.user.findFirst({ where: { email: input.email } });
  if (existing) {
    throw new AuthError('A user with that email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);

  const tenant = await prisma.tenant.create({
    data: {
      name: input.tenantName,
      subscriptionStatus: opts.subscriptionStatus,
      subscriptionPlan: input.subscriptionPlan,
      users: {
        create: {
          email: input.email,
          passwordHash,
          role: 'admin',
          isPlatformAdmin: opts.isPlatformAdmin,
        },
      },
    },
    include: { users: true },
  });

  const admin = tenant.users[0];
  if (!admin) {
    throw new AuthError('Failed to create the initial admin user', 500);
  }

  return { tenant, admin };
}

/**
 * Public registration only ever works ONCE — for the very first user in a
 * fresh install, who becomes the platform admin (the person selling/
 * operating ROISystem, confirmed with the user: they want to hand-create
 * every client account after that, not leave self-signup open). Every
 * subsequent tenant is created by an authenticated platform admin via
 * POST /api/platform/tenants instead.
 */
export async function registerFirstAdmin(input: { tenantName: string; email: string; password: string }) {
  const totalUsers = await prisma.user.count();
  if (totalUsers > 0) {
    throw new AuthError('El registro público está cerrado. Pide a tu administrador de plataforma que te cree una cuenta.', 403);
  }

  const { tenant, admin } = await createTenantWithAdmin(input, { isPlatformAdmin: true, subscriptionStatus: 'active' });

  const token = signAuthToken({ sub: admin.id, tenantId: tenant.id, role: admin.role, isPlatformAdmin: admin.isPlatformAdmin });
  return {
    token,
    tenant: { id: tenant.id, name: tenant.name },
    user: { id: admin.id, email: admin.email, role: admin.role, isPlatformAdmin: admin.isPlatformAdmin },
  };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findFirst({ where: { email: input.email }, include: { tenant: true } });
  if (!user) {
    throw new AuthError('Invalid credentials', 401);
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AuthError('Invalid credentials', 401);
  }
  // Suspension takes effect on next login, not mid-session (JWTs aren't
  // re-checked per-request) — an accepted tradeoff for the "manual billing
  // for now" approach the user confirmed, instead of a DB hit on every
  // request. Platform admins are exempt so they're never locked out of
  // fixing an accidental suspension.
  if (user.tenant.subscriptionStatus === 'suspended' && !user.isPlatformAdmin) {
    throw new AuthError('Esta cuenta está suspendida. Contacta a tu proveedor.', 403);
  }
  const token = signAuthToken({ sub: user.id, tenantId: user.tenantId, role: user.role, isPlatformAdmin: user.isPlatformAdmin });
  return {
    token,
    user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, isPlatformAdmin: user.isPlatformAdmin },
  };
}
