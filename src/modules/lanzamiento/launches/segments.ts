import { prisma } from '../../../db/prisma.js';

export function listTribeTags(locationId: string) {
  return prisma.tribeTag.findMany({ where: { locationId }, orderBy: { createdAt: 'asc' } });
}

export function createTribeTag(locationId: string, input: { tagName: string; label: string }) {
  return prisma.tribeTag.create({ data: { locationId, tagName: input.tagName, label: input.label } });
}

export async function deleteTribeTag(locationId: string, tribeTagId: string) {
  const tribe = await prisma.tribeTag.findFirst({ where: { id: tribeTagId, locationId } });
  if (!tribe) return false;
  await prisma.tribeTag.delete({ where: { id: tribeTagId } });
  return true;
}

export interface TribeRow {
  tagName: string;
  label: string;
  count: number;
}

/**
 * Counts contacts created inside the launch window per configured "tribu"
 * (Configuración → Lanzamientos → Tribus maps a GHL tag to a tribe label —
 * see TribeTag's schema comment for why this needs an explicit mapping
 * instead of inferring it from tag names).
 */
export async function getLaunchTribeBreakdown(locationId: string, from: Date, to: Date): Promise<TribeRow[]> {
  const tribes = await prisma.tribeTag.findMany({ where: { locationId } });
  if (tribes.length === 0) return [];

  const counts = await Promise.all(
    tribes.map((t) =>
      prisma.contact.count({
        where: { locationId, ghlCreatedAt: { gte: from, lte: to }, tags: { some: { tag: { name: t.tagName } } } },
      }),
    ),
  );

  return tribes.map((t, i) => ({ tagName: t.tagName, label: t.label, count: counts[i] ?? 0 })).sort((a, b) => b.count - a.count);
}

export interface CountryRow {
  country: string;
  count: number;
}

/**
 * GHL's standard Contact object carries a `country` field, but it's not a
 * synced column (see Contact model) — it's read out of the stored raw
 * payload instead, same approach as producerNet() in launchSales.ts for
 * Hotmart's raw payload.
 */
export async function getLaunchCountryBreakdown(locationId: string, from: Date, to: Date): Promise<CountryRow[]> {
  const contacts = await prisma.contact.findMany({
    where: { locationId, ghlCreatedAt: { gte: from, lte: to } },
    select: { raw: true },
  });

  const counts = new Map<string, number>();
  for (const c of contacts) {
    const raw = c.raw as { country?: unknown } | null;
    const country = typeof raw?.country === 'string' && raw.country.trim() ? raw.country.trim() : 'Sin país';
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
}
