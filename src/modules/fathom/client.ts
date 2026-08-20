import axios, { type AxiosRequestConfig } from 'axios';
import { env } from '../../config/env.js';

/**
 * Confirmed against developers.fathom.ai (Quickstart page, fetched
 * 2026-08-03): personal API keys authenticate with an `X-Api-Key` header,
 * NOT `Authorization: Bearer` — the base URL (`FATHOM_API_BASE_URL` default)
 * and the `/meetings` endpoint used in sync/videoCalls.ts are also confirmed
 * there. NOT verified: the exact response field names for a meeting
 * (title/recording_url/transcript/duration_seconds/created_at) and whether
 * `/meetings` paginates — those pages weren't reachable for automated
 * fetching, so `sync/videoCalls.ts` still treats them as best-effort. Fathom
 * also offers an OAuth app flow for third-party integrations
 * (`/oauth2/token`), which would let each closer click "Conectar con
 * Fathom" instead of pasting an API key — but that requires registering
 * ROISystem as a Fathom OAuth partner first (a real signup/review step on
 * fathom.ai, not something that can be done from here); the personal-API-key
 * flow below is what's actually connectable today.
 */
export async function fathomRequest<T>(apiKey: string, options: AxiosRequestConfig): Promise<T> {
  const response = await axios.request<T>({
    baseURL: env.FATHOM_API_BASE_URL,
    ...options,
    headers: {
      'X-Api-Key': apiKey,
      Accept: 'application/json',
      ...options.headers,
    },
  });
  return response.data;
}

export function fathomGet<T>(apiKey: string, url: string, params?: Record<string, unknown>): Promise<T> {
  return fathomRequest<T>(apiKey, { method: 'GET', url, params });
}
