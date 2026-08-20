import axios, { type AxiosRequestConfig } from 'axios';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { decryptToken } from './crypto.js';
import { GHL_API_VERSION } from './constants.js';

/**
 * Confirmed against marketplace.gohighlevel.com/docs/Authorization/PrivateIntegrationsToken:
 * a Private Integration Token (PIT) is a static bearer token the client
 * generates themselves from their own GHL sub-account settings — no
 * Marketplace app, no OAuth install/refresh flow, no per-tenant Agency
 * account required on our side (see README "Conexión con GHL (Fase 6)").
 * Unlike the old Agency/Location OAuth tokens this replaced, PITs don't
 * expire on a schedule we need to track, so there's no refresh/caching
 * layer here — just decrypt-and-use per request.
 */
async function getLocationPit(tenantId: string, ghlLocationId: string): Promise<string> {
  const location = await prisma.location.findUnique({ where: { tenantId_ghlLocationId: { tenantId, ghlLocationId } } });
  if (!location?.ghlPitCipher) {
    throw new Error(`Location ${ghlLocationId} has no GHL Private Integration Token connected yet`);
  }
  return decryptToken(location.ghlPitCipher);
}

export async function ghlLocationRequest<T>(
  tenantId: string,
  ghlLocationId: string,
  options: AxiosRequestConfig,
): Promise<T> {
  const accessToken = await getLocationPit(tenantId, ghlLocationId);

  const response = await axios.request<T>({
    baseURL: env.GHL_API_BASE_URL,
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Version: GHL_API_VERSION,
      Accept: 'application/json',
      ...options.headers,
    },
  });
  return response.data;
}

export function ghlLocationGet<T>(
  tenantId: string,
  ghlLocationId: string,
  url: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return ghlLocationRequest<T>(tenantId, ghlLocationId, { method: 'GET', url, params });
}

export function ghlLocationPost<T>(
  tenantId: string,
  ghlLocationId: string,
  url: string,
  data?: unknown,
): Promise<T> {
  return ghlLocationRequest<T>(tenantId, ghlLocationId, { method: 'POST', url, data });
}

export function ghlLocationPut<T>(
  tenantId: string,
  ghlLocationId: string,
  url: string,
  data?: unknown,
): Promise<T> {
  return ghlLocationRequest<T>(tenantId, ghlLocationId, { method: 'PUT', url, data });
}
