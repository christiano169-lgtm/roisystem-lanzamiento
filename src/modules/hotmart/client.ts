import axios, { type AxiosRequestConfig } from 'axios';
import { env } from '../../config/env.js';

/**
 * OAuth2 client_credentials + Sales History base URL confirmed against
 * developers.hotmart.com ("App Authentication" and "Sales History" docs,
 * fetched 2026-08-03). NOT verified against a live account: the exact shape
 * of each sale item in the /sales/history response — Hotmart's docs page
 * didn't render for automated fetching, so `sync/sales.ts` parses several
 * plausible field-name variants defensively and always keeps `raw` for
 * manual inspection. Confirm and simplify once a real account is connected.
 */

const EXPIRY_SAFETY_MARGIN_MS = 60_000;
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = clientId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()) return cached.accessToken;

  const response = await axios.post<{ access_token: string; expires_in: number }>(
    env.HOTMART_OAUTH_URL,
    null,
    { params: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret } },
  );

  tokenCache.set(cacheKey, {
    accessToken: response.data.access_token,
    expiresAt: Date.now() + response.data.expires_in * 1000,
  });
  return response.data.access_token;
}

export async function hotmartRequest<T>(clientId: string, clientSecret: string, options: AxiosRequestConfig): Promise<T> {
  const accessToken = await getAccessToken(clientId, clientSecret);
  const response = await axios.request<T>({
    baseURL: env.HOTMART_API_BASE_URL,
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...options.headers },
  });
  return response.data;
}

export function hotmartGet<T>(clientId: string, clientSecret: string, url: string, params?: Record<string, unknown>): Promise<T> {
  return hotmartRequest<T>(clientId, clientSecret, { method: 'GET', url, params });
}
