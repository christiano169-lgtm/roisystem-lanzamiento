import { prisma } from '../../db/prisma.js';

export interface HotmartSummary {
  revenue: number;
  salesCount: number;
  averageTicket: number;
  byProduct: Array<{ productName: string; revenue: number; salesCount: number }>;
}

const APPROVED_STATUSES = ['APPROVED', 'COMPLETE'];

export async function getHotmartSummary(locationId: string, from?: Date, to?: Date): Promise<HotmartSummary> {
  const rows = await prisma.hotmartSale.findMany({
    where: {
      locationId,
      status: { in: APPROVED_STATUSES },
      ...(from || to ? { purchaseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
  });

  const revenue = rows.reduce((sum, r) => sum + Number(r.priceValue), 0);
  const salesCount = rows.length;

  const byProductMap = new Map<string, { productName: string; revenue: number; salesCount: number }>();
  for (const r of rows) {
    const key = r.productName ?? 'Sin producto';
    const entry = byProductMap.get(key) ?? { productName: key, revenue: 0, salesCount: 0 };
    entry.revenue += Number(r.priceValue);
    entry.salesCount += 1;
    byProductMap.set(key, entry);
  }

  return {
    revenue,
    salesCount,
    averageTicket: salesCount > 0 ? Math.round((revenue / salesCount) * 100) / 100 : 0,
    byProduct: [...byProductMap.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
