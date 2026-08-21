import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../config/logger.js';
import { hotmartGet } from '../client.js';
import { getHotmartCredentials } from '../connectionService.js';

// Best-effort shape (see client.ts NOTE) — Hotmart's nested
// purchase/buyer/product structure is the commonly-documented one, but
// unverified against a live response. Every field is read defensively and
// the full raw item is always kept, so a real account can be reconciled
// without re-deriving the sync from scratch.
export interface HotmartSaleItem {
  purchase?: {
    transaction?: string;
    order_date?: number;
    approved_date?: number;
    status?: string;
    price?: { value?: number; currency_value?: string };
  };
  buyer?: { email?: string; name?: string };
  product?: { id?: number; name?: string };
  transaction?: string;
}

interface HotmartSalesHistoryResponse {
  items: HotmartSaleItem[];
  page_info?: { next_page_token?: string };
}

const LOOKBACK_DAYS = 90;

export function transactionIdOf(item: HotmartSaleItem): string | null {
  return item.purchase?.transaction ?? item.transaction ?? null;
}

/**
 * Shared by the polling sync below and the webhook receiver
 * (src/modules/hotmart/webhooks.ts) — a webhook's `data` object has the same
 * product/buyer/purchase shape as one item of `/sales/history`, so both
 * paths upsert through here instead of duplicating the field mapping.
 */
export async function upsertHotmartSale(locationId: string, item: HotmartSaleItem): Promise<boolean> {
  const transactionId = transactionIdOf(item);
  if (!transactionId) {
    logger.warn({ item }, 'Skipping Hotmart sale with no transaction id');
    return false;
  }
  try {
    const purchaseDateMs = item.purchase?.approved_date ?? item.purchase?.order_date;
    const status = item.purchase?.status ?? null;
    await prisma.hotmartSale.upsert({
      where: { locationId_transactionId: { locationId, transactionId } },
      create: {
        locationId,
        transactionId,
        productName: item.product?.name ?? null,
        buyerEmail: item.buyer?.email ?? null,
        priceValue: item.purchase?.price?.value ?? 0,
        currency: item.purchase?.price?.currency_value ?? null,
        status,
        purchaseDate: purchaseDateMs ? new Date(purchaseDateMs) : null,
        raw: item as object,
      },
      update: {
        productName: item.product?.name ?? null,
        status,
        raw: item as object,
      },
    });
    await recordSaleStatusEvent(locationId, transactionId, item.buyer?.email ?? null, item.product?.name ?? null, status, item);
    return true;
  } catch (err) {
    logger.error({ err, transactionId }, 'Failed to upsert Hotmart sale');
    return false;
  }
}

/**
 * Append-only log of every distinct status a transaction passes through —
 * see HotmartSaleEvent's schema comment for why this can't just be read
 * off HotmartSale.status. Skips the insert when the transaction's most
 * recent logged status already matches, so repeated polls of an unchanged
 * sale don't spam the table.
 */
async function recordSaleStatusEvent(
  locationId: string,
  transactionId: string | null,
  buyerEmail: string | null,
  productName: string | null,
  status: string | null,
  raw: unknown,
): Promise<void> {
  if (!status) return;
  if (transactionId) {
    const last = await prisma.hotmartSaleEvent.findFirst({
      where: { locationId, transactionId },
      orderBy: { eventAt: 'desc' },
      select: { status: true },
    });
    if (last?.status === status) return;
  }
  await prisma.hotmartSaleEvent.create({
    data: { locationId, transactionId, buyerEmail, productName, status, raw: raw as object },
  });
}

export { recordSaleStatusEvent };

/**
 * Pulls the last `LOOKBACK_DAYS` of sales for a Location's connected Hotmart
 * account and upserts them. Single-page only, same scope tradeoff as the
 * Fathom/Meta Ads syncs — revisit with `page_info.next_page_token` pagination
 * if an account has more sales than fit in one response page. This stays the
 * reliable backfill path even once the webhook is connected — same
 * best-effort-realtime/reliable-backfill split as the GHL integration.
 */
export async function syncHotmartSales(locationId: string): Promise<number> {
  const { clientId, clientSecret } = await getHotmartCredentials(locationId);

  const startDate = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const response = await hotmartGet<HotmartSalesHistoryResponse>(clientId, clientSecret, '/sales/history', {
    start_date: startDate,
    end_date: Date.now(),
  });

  let synced = 0;
  for (const item of response.items ?? []) {
    if (await upsertHotmartSale(locationId, item)) synced++;
  }

  await prisma.hotmartConnection.update({ where: { locationId }, data: { lastSyncedAt: new Date() } });
  return synced;
}
