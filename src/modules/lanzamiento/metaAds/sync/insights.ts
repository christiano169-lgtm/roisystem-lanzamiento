import { prisma } from '../../../../db/prisma.js';
import { logger } from '../../../../config/logger.js';
import { metaAdsGet } from '../client.js';
import { getMetaAdsAccessToken } from '../connectionService.js';

export interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  date_start: string;
}

interface MetaInsightsResponse {
  data: MetaInsightRow[];
}

const LOOKBACK_DAYS = 30;
// Best-effort: GHL/Fathom's lead-ads action_type isn't documented anywhere
// we could verify against a live account — this covers the variants Meta's
// own docs/community reference most often for lead generation. Revisit once
// a real ad account with lead ads is connected (see client.ts NOTE).
const LEAD_ACTION_TYPES = new Set(['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']);

export function normalizeAdAccountId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

export function extractLeadCount(actions: MetaAction[] | undefined): number {
  if (!actions) return 0;
  return actions.filter((a) => LEAD_ACTION_TYPES.has(a.action_type)).reduce((sum, a) => sum + (Number(a.value) || 0), 0);
}

/**
 * Pulls the last `LOOKBACK_DAYS` of daily, per-campaign insights for a
 * Location's connected ad account and upserts them. Single-page only (no
 * `paging.next` follow) — same "recent window is enough for now" scope
 * tradeoff as the Fathom sync; revisit if an account has more campaigns than
 * fit in one response page.
 */
export async function syncMetaAdsInsights(locationId: string): Promise<number> {
  const { adAccountId, accessToken } = await getMetaAdsAccessToken(locationId);

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const until = new Date();

  const response = await metaAdsGet<MetaInsightsResponse>(accessToken, `/${normalizeAdAccountId(adAccountId)}/insights`, {
    level: 'campaign',
    time_increment: 1,
    time_range: JSON.stringify({ since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) }),
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,date_start',
  });

  let synced = 0;
  for (const row of response.data) {
    try {
      await prisma.metaAdInsight.upsert({
        where: { locationId_campaignId_date: { locationId, campaignId: row.campaign_id, date: new Date(row.date_start) } },
        create: {
          locationId,
          campaignId: row.campaign_id,
          campaignName: row.campaign_name ?? null,
          date: new Date(row.date_start),
          spend: row.spend ?? '0',
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          leads: extractLeadCount(row.actions),
          raw: row as object,
        },
        update: {
          campaignName: row.campaign_name ?? null,
          spend: row.spend ?? '0',
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          leads: extractLeadCount(row.actions),
          raw: row as object,
        },
      });
      synced++;
    } catch (err) {
      logger.error({ err, campaignId: row.campaign_id, date: row.date_start }, 'Failed to upsert Meta Ads insight row');
    }
  }

  await prisma.metaAdsConnection.update({ where: { locationId }, data: { lastSyncedAt: new Date() } });
  return synced;
}
