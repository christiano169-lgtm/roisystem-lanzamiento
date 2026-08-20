import OpenAI from 'openai';
import { prisma } from '../../db/prisma.js';
import { encryptToken, decryptToken } from '../ghl/crypto.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function saveTenantOpenAiKey(tenantId: string, apiKey: string, model?: string) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { openAiKeyCipher: encryptToken(apiKey), openAiModel: model ?? DEFAULT_MODEL },
  });
}

export async function getTenantAiSettings(tenantId: string): Promise<{ apiKey: string; model: string }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (!tenant.openAiKeyCipher) {
    throw new Error(`Tenant ${tenantId} has no OpenAI key configured — set one via PUT /api/settings/openai-key`);
  }
  return { apiKey: decryptToken(tenant.openAiKeyCipher), model: tenant.openAiModel ?? DEFAULT_MODEL };
}

export async function getTenantOpenAiClient(tenantId: string): Promise<{ client: OpenAI; model: string }> {
  const { apiKey, model } = await getTenantAiSettings(tenantId);
  return { client: new OpenAI({ apiKey }), model };
}
