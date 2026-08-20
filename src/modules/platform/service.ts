import type { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { createTenantWithAdmin } from '../auth/service.js';

export interface TenantSummary {
  id: string;
  name: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: string | null;
  subscriptionNotes: string | null;
  createdAt: Date;
  usersCount: number;
  locationsCount: number;
  adminEmail: string | null;
}

/** Every tenant, for the platform admin's master list — includes a light usage snapshot per tenant. */
export async function listTenantsForPlatform(): Promise<TenantSummary[]> {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      users: { select: { email: true, role: true } },
      locations: { select: { id: true } },
    },
  });

  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    subscriptionStatus: t.subscriptionStatus,
    subscriptionPlan: t.subscriptionPlan,
    subscriptionNotes: t.subscriptionNotes,
    createdAt: t.createdAt,
    usersCount: t.users.length,
    locationsCount: t.locations.length,
    adminEmail: t.users.find((u) => u.role === 'admin')?.email ?? t.users[0]?.email ?? null,
  }));
}

/** Platform admin hand-creates a new client's tenant + first admin user (self-signup is closed, see auth/service.ts). */
export async function createTenantForClient(input: {
  tenantName: string;
  email: string;
  password: string;
  subscriptionPlan?: string;
}) {
  const { tenant, admin } = await createTenantWithAdmin(input, { isPlatformAdmin: false, subscriptionStatus: 'trial' });
  // `tenant` from createTenantWithAdmin carries a nested `users` array
  // (including passwordHash) — never forward that raw object over the API.
  return {
    tenant: { id: tenant.id, name: tenant.name, subscriptionStatus: tenant.subscriptionStatus, subscriptionPlan: tenant.subscriptionPlan },
    admin: { id: admin.id, email: admin.email, role: admin.role },
  };
}

export async function updateTenantSubscription(
  tenantId: string,
  input: { subscriptionStatus?: SubscriptionStatus; subscriptionPlan?: string | null; subscriptionNotes?: string | null },
) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: input,
    select: { id: true, name: true, subscriptionStatus: true, subscriptionPlan: true, subscriptionNotes: true },
  });
  return tenant;
}
