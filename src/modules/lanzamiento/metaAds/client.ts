import axios, { type AxiosRequestConfig } from 'axios';
import { env } from '../../../config/env.js';

/**
 * Confirmed against developers.facebook.com/docs/marketing-api/insights
 * (fetched 2026-08-03): base path, `access_token` query param auth, and the
 * `fields`/`time_range`/`level` query shape for GET /{ad-account-id}/insights.
 * NOT verified against a live account: the exact `actions` array shape used
 * to extract lead counts (`action_type === 'lead'` vs
 * `'onsite_conversion.lead_grouped'` vs a lead-ad-specific type) — see
 * `extractLeadCount` in sync/insights.ts, and confirm once a real ad account
 * with lead ads is connected.
 */
export async function metaAdsRequest<T>(accessToken: string, options: AxiosRequestConfig): Promise<T> {
  const response = await axios.request<T>({
    baseURL: env.META_ADS_API_BASE_URL,
    ...options,
    params: { access_token: accessToken, ...options.params },
  });
  return response.data;
}

export function metaAdsGet<T>(accessToken: string, url: string, params?: Record<string, unknown>): Promise<T> {
  return metaAdsRequest<T>(accessToken, { method: 'GET', url, params });
}
