import { prisma } from '../../db/prisma.js';
import type { HotmartOfferType } from '@prisma/client';

// Hotmart's own event names (see webhooks.ts / sync/sales.ts), stored as
// HotmartSale.status. Compared case-insensitively since the polling sync and
// the webhook path have historically disagreed on casing (see README caveat
// on this module).
const APPROVED_STATUSES = new Set(['APPROVED', 'COMPLETE']);
const PENDING_CASH_STATUSES = new Set(['BILLET_PRINTED']);
const REFUND_LIKE_STATUSES = new Set(['REFUNDED', 'PROTEST', 'CHARGEBACK']);
const CANCELLED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'EXPIRED']);

export interface LaunchSalesKpis {
  comprasAprobadas: number;
  upgradesVip: number;
  orderBumps: number;
  leadsGestionados: number;
  ticketPromedio: number;
  ingresoBruto: number;
  netoProductor: number;
  ingresoPorUpgrade: number;
  ingresoPorBumps: number;
  pendientePorCobrar: number;
  reembolsosYDisputas: number;
}

export interface SalesVolumeRow {
  date: string; // yyyy-mm-dd
  compras: number;
  upgrades: number;
  orderBumps: number;
}

export interface SalesRankingRow {
  ownerGhlId: string;
  name: string;
  leads: number;
  compras: number;
  upgrades: number;
  bumps: number;
  ingresoNeto: number;
  conversionPct: number;
}

/**
 * Best-effort extraction of the producer's net cut from a sale's raw
 * payload — Hotmart's commissions shape wasn't confirmed against a live
 * account (same caveat as the rest of this module, see README). Tries the
 * documented `commissions` array (`[{ source: 'PRODUCER', value }]`) and
 * falls back to the full price when that shape isn't present, so the KPI
 * still shows a number instead of silently zeroing out.
 */
function producerNet(raw: unknown, fallback: number): number {
  if (raw && typeof raw === 'object' && 'commissions' in raw) {
    const commissions = (raw as { commissions?: unknown }).commissions;
    if (Array.isArray(commissions)) {
      const producer = commissions.find((c) => c && typeof c === 'object' && (c as { source?: string }).source === 'PRODUCER');
      const value = producer && typeof producer === 'object' ? (producer as { value?: number }).value : undefined;
      if (typeof value === 'number') return value;
    }
  }
  return fallback;
}

function offerTypeMap(offers: { hotmartProductName: string; offerType: HotmartOfferType }[]): Map<string, HotmartOfferType> {
  return new Map(offers.map((o) => [o.hotmartProductName, o.offerType]));
}

export async function getLaunchSalesKpis(locationId: string, from: Date, to: Date): Promise<LaunchSalesKpis> {
  const [offers, sales, leadsGestionados] = await Promise.all([
    prisma.hotmartOffer.findMany({ where: { locationId } }),
    prisma.hotmartSale.findMany({ where: { locationId, purchaseDate: { gte: from, lte: to } } }),
    prisma.contact.count({ where: { locationId, ownerGhlId: { not: null }, ghlCreatedAt: { gte: from, lte: to } } }),
  ]);

  const typeByProduct = offerTypeMap(offers);
  const typeOf = (productName: string | null) => (productName ? (typeByProduct.get(productName) ?? 'general') : 'general');

  let comprasAprobadas = 0;
  let upgradesVip = 0;
  let orderBumps = 0;
  let ingresoBruto = 0;
  let netoProductor = 0;
  let ingresoPorUpgrade = 0;
  let ingresoPorBumps = 0;
  let pendientePorCobrar = 0;
  let reembolsosYDisputas = 0;

  for (const sale of sales) {
    const status = (sale.status ?? '').toUpperCase();
    const price = Number(sale.priceValue);
    const type = typeOf(sale.productName);

    if (APPROVED_STATUSES.has(status)) {
      ingresoBruto += price;
      netoProductor += producerNet(sale.raw, price);
      if (type === 'upgrade') {
        upgradesVip++;
        ingresoPorUpgrade += price;
      } else if (type === 'order_bump') {
        orderBumps++;
        ingresoPorBumps += price;
      } else {
        comprasAprobadas++;
      }
    } else if (PENDING_CASH_STATUSES.has(status)) {
      pendientePorCobrar += price;
    } else if (REFUND_LIKE_STATUSES.has(status)) {
      reembolsosYDisputas += price;
    }
  }

  const totalTransactions = comprasAprobadas + upgradesVip + orderBumps;

  return {
    comprasAprobadas,
    upgradesVip,
    orderBumps,
    leadsGestionados,
    ticketPromedio: totalTransactions > 0 ? Math.round((ingresoBruto / totalTransactions) * 100) / 100 : 0,
    ingresoBruto,
    netoProductor,
    ingresoPorUpgrade,
    ingresoPorBumps,
    pendientePorCobrar,
    reembolsosYDisputas: -reembolsosYDisputas,
  };
}

export interface StatusBreakdownBucket {
  plus: number;
  general: number;
}

export interface LaunchStatusBreakdown {
  aprobadas: StatusBreakdownBucket;
  abandonados: StatusBreakdownBucket;
  canceladas: StatusBreakdownBucket;
  ticketsEmitidos: StatusBreakdownBucket;
  recovery: { total: number; recuperados: number; pendientes: number };
}

/**
 * "Plus" (VIP) vs "General" split for the four states the client tracks
 * per launch: approved purchases, abandoned carts, cancellations, and cash
 * tickets issued — plus a recovery count for the three "money on the
 * table" states (abandoned/cancelled/ticket), i.e. how many of those
 * buyers eventually completed an approved purchase vs. still haven't.
 * Reads from HotmartSaleEvent (see its schema comment) instead of
 * HotmartSale, since the latter only keeps a transaction's latest status —
 * a paid cash ticket would otherwise look indistinguishable from a normal
 * approved sale and undercount "tickets emitidos".
 */
export async function getLaunchStatusBreakdown(locationId: string, from: Date, to: Date): Promise<LaunchStatusBreakdown> {
  const [offers, events, approvedSales] = await Promise.all([
    prisma.hotmartOffer.findMany({ where: { locationId } }),
    prisma.hotmartSaleEvent.findMany({ where: { locationId, eventAt: { gte: from, lte: to } } }),
    prisma.hotmartSale.findMany({
      where: { locationId, purchaseDate: { gte: from, lte: to }, status: { in: [...APPROVED_STATUSES] } },
      select: { productName: true, buyerEmail: true },
    }),
  ]);

  const typeByProduct = offerTypeMap(offers);
  const bucketOf = (productName: string | null): keyof StatusBreakdownBucket =>
    productName && typeByProduct.get(productName) === 'vip' ? 'plus' : 'general';

  const aprobadas: StatusBreakdownBucket = { plus: 0, general: 0 };
  for (const sale of approvedSales) aprobadas[bucketOf(sale.productName)]++;

  const abandonados: StatusBreakdownBucket = { plus: 0, general: 0 };
  const canceladas: StatusBreakdownBucket = { plus: 0, general: 0 };
  const ticketsEmitidos: StatusBreakdownBucket = { plus: 0, general: 0 };
  const moneyOnTableEmails = new Set<string>();

  for (const ev of events) {
    const status = (ev.status ?? '').toUpperCase();
    const bucket = bucketOf(ev.productName);
    if (status === 'ABANDONED_CART') {
      abandonados[bucket]++;
      if (ev.buyerEmail) moneyOnTableEmails.add(ev.buyerEmail.toLowerCase());
    } else if (CANCELLED_STATUSES.has(status)) {
      canceladas[bucket]++;
      if (ev.buyerEmail) moneyOnTableEmails.add(ev.buyerEmail.toLowerCase());
    } else if (PENDING_CASH_STATUSES.has(status)) {
      ticketsEmitidos[bucket]++;
      if (ev.buyerEmail) moneyOnTableEmails.add(ev.buyerEmail.toLowerCase());
    }
  }

  const approvedEmails = new Set(approvedSales.filter((s) => s.buyerEmail).map((s) => s.buyerEmail!.toLowerCase()));
  let recuperados = 0;
  for (const email of moneyOnTableEmails) {
    if (approvedEmails.has(email)) recuperados++;
  }

  return {
    aprobadas,
    abandonados,
    canceladas,
    ticketsEmitidos,
    recovery: { total: moneyOnTableEmails.size, recuperados, pendientes: moneyOnTableEmails.size - recuperados },
  };
}

export async function getLaunchSalesVolume(locationId: string, from: Date, to: Date): Promise<SalesVolumeRow[]> {
  const [offers, sales] = await Promise.all([
    prisma.hotmartOffer.findMany({ where: { locationId } }),
    prisma.hotmartSale.findMany({
      where: { locationId, purchaseDate: { gte: from, lte: to }, status: { in: [...APPROVED_STATUSES] } },
      select: { productName: true, purchaseDate: true },
    }),
  ]);
  const typeByProduct = offerTypeMap(offers);

  const byDate = new Map<string, SalesVolumeRow>();
  for (const sale of sales) {
    if (!sale.purchaseDate) continue;
    const date = sale.purchaseDate.toISOString().slice(0, 10);
    const row = byDate.get(date) ?? { date, compras: 0, upgrades: 0, orderBumps: 0 };
    const type = sale.productName ? (typeByProduct.get(sale.productName) ?? 'general') : 'general';
    if (type === 'upgrade') row.upgrades++;
    else if (type === 'order_bump') row.orderBumps++;
    else row.compras++;
    byDate.set(date, row);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Attributes each sale to a "Responsable" via the buyer's email → the GHL
 * Contact with that email → its `ownerGhlId` — Hotmart has no concept of
 * "which setter/closer gets credit," so this is the only join available.
 * Sales for a buyer email that doesn't match any synced Contact are
 * excluded from the ranking (nothing to attribute them to).
 */
export async function getLaunchSalesRanking(locationId: string, from: Date, to: Date): Promise<SalesRankingRow[]> {
  const [offers, sales, contacts, ghlUsers, leadCounts] = await Promise.all([
    prisma.hotmartOffer.findMany({ where: { locationId } }),
    prisma.hotmartSale.findMany({
      where: { locationId, purchaseDate: { gte: from, lte: to }, status: { in: [...APPROVED_STATUSES] }, buyerEmail: { not: null } },
    }),
    prisma.contact.findMany({ where: { locationId, email: { not: null } }, select: { email: true, ownerGhlId: true } }),
    prisma.ghlUser.findMany({ where: { locationId } }),
    prisma.contact.groupBy({
      by: ['ownerGhlId'],
      where: { locationId, ownerGhlId: { not: null }, ghlCreatedAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
  ]);

  const typeByProduct = offerTypeMap(offers);
  const ownerByEmail = new Map(contacts.filter((c) => c.ownerGhlId).map((c) => [c.email!.toLowerCase(), c.ownerGhlId!]));
  const nameByOwner = new Map(ghlUsers.map((u) => [u.ghlUserId, u.name]));
  const leadsByOwner = new Map(leadCounts.map((r) => [r.ownerGhlId!, r._count._all]));

  type Acc = { compras: number; upgrades: number; bumps: number; ingresoNeto: number };
  const byOwner = new Map<string, Acc>();

  for (const sale of sales) {
    const ownerGhlId = ownerByEmail.get(sale.buyerEmail!.toLowerCase());
    if (!ownerGhlId) continue;
    const acc = byOwner.get(ownerGhlId) ?? { compras: 0, upgrades: 0, bumps: 0, ingresoNeto: 0 };
    const type = sale.productName ? (typeByProduct.get(sale.productName) ?? 'general') : 'general';
    const price = Number(sale.priceValue);
    if (type === 'upgrade') acc.upgrades++;
    else if (type === 'order_bump') acc.bumps++;
    else acc.compras++;
    acc.ingresoNeto += producerNet(sale.raw, price);
    byOwner.set(ownerGhlId, acc);
  }

  return Array.from(byOwner.entries())
    .map(([ownerGhlId, acc]) => {
      const leads = leadsByOwner.get(ownerGhlId) ?? 0;
      const totalVentas = acc.compras + acc.upgrades + acc.bumps;
      return {
        ownerGhlId,
        name: nameByOwner.get(ownerGhlId) ?? ownerGhlId,
        leads,
        compras: acc.compras,
        upgrades: acc.upgrades,
        bumps: acc.bumps,
        ingresoNeto: acc.ingresoNeto,
        conversionPct: leads > 0 ? Math.round((totalVentas / leads) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.ingresoNeto - a.ingresoNeto);
}
