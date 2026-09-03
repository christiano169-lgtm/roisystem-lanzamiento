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

// Calling codes for this audience (Latin America + Spain + a few common
// others), longest prefix first so e.g. "593..." matches Ecuador before the
// bare "5" or "1" fallbacks would wrongly fire.
const CALLING_CODES: Array<[string, string]> = [
  ['593', 'EC'], ['507', 'PA'], ['506', 'CR'], ['502', 'GT'], ['503', 'SV'],
  ['504', 'HN'], ['505', 'NI'], ['598', 'UY'], ['595', 'PY'], ['591', 'BO'],
  ['51', 'PE'], ['52', 'MX'], ['54', 'AR'], ['55', 'BR'], ['56', 'CL'],
  ['57', 'CO'], ['58', 'VE'], ['34', 'ES'], ['53', 'CU'], ['44', 'GB'],
  ['39', 'IT'], ['33', 'FR'], ['49', 'DE'], ['1', 'US'],
];

function countryFromPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  for (const [code, iso] of CALLING_CODES) {
    if (digits.startsWith(code)) return iso;
  }
  return null;
}

/**
 * GHL's standard Contact object carries a `country` field, but it's not a
 * synced column (see Contact model) — it's read out of the stored raw
 * payload, same approach as producerNet() in launchSales.ts for Hotmart's
 * raw payload.
 *
 * Confirmed 2026-09 against this account's real data: GHL's own `country`
 * field defaults to "US" for any contact whose signup form never asked for
 * it — several contacts with clearly Mexican/Spanish/Ecuadorian phone
 * numbers (+52/+34/+593) were stored with country "US". That's not a sync
 * bug on our side, it's what GHL sends — so this derives country from the
 * phone number's calling code instead (far more reliable for this
 * audience), falling back to GHL's own field only when there's no phone to
 * go on.
 */
export async function getLaunchCountryBreakdown(locationId: string, from: Date, to: Date): Promise<CountryRow[]> {
  const contacts = await prisma.contact.findMany({
    where: { locationId, ghlCreatedAt: { gte: from, lte: to } },
    select: { phone: true, raw: true },
  });

  const counts = new Map<string, number>();
  for (const c of contacts) {
    const raw = c.raw as { country?: unknown } | null;
    const fromPhone = countryFromPhone(c.phone);
    const fromRaw = typeof raw?.country === 'string' && raw.country.trim() ? raw.country.trim() : null;
    const country = fromPhone ?? fromRaw ?? 'Sin país';
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
}
