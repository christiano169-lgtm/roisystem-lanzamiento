import { prisma } from '../../../db/prisma.js';
import { pct } from '../../kpis/service.js';

export interface MetaAdsSummary {
  spend: number;
  leads: number;
  costPerLead: number | null;
  clicks: number;
  impressions: number;
  ctr: number;
  byCampaign: Array<{ campaignId: string; campaignName: string | null; spend: number; leads: number }>;
}

export async function getMetaAdsSummary(locationId: string, from?: Date, to?: Date): Promise<MetaAdsSummary> {
  const rows = await prisma.metaAdInsight.findMany({
    where: {
      locationId,
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
  });

  const spend = rows.reduce((sum, r) => sum + Number(r.spend), 0);
  const leads = rows.reduce((sum, r) => sum + r.leads, 0);
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);

  const byCampaignMap = new Map<string, { campaignId: string; campaignName: string | null; spend: number; leads: number }>();
  for (const r of rows) {
    const entry = byCampaignMap.get(r.campaignId) ?? { campaignId: r.campaignId, campaignName: r.campaignName, spend: 0, leads: 0 };
    entry.spend += Number(r.spend);
    entry.leads += r.leads;
    byCampaignMap.set(r.campaignId, entry);
  }

  return {
    spend,
    leads,
    costPerLead: leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
    clicks,
    impressions,
    ctr: pct(clicks, impressions),
    byCampaign: [...byCampaignMap.values()].sort((a, b) => b.spend - a.spend),
  };
}
