import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),

  TOKEN_ENCRYPTION_KEY: z.string().min(1),

  // Fase 6: no app-level GHL credentials at all — each Location connects
  // with its own client-generated Private Integration Token (see
  // src/modules/locations/service.ts, src/modules/ghl/client.ts). No
  // Marketplace app, no OAuth, nothing tenant-wide to configure here.
  GHL_API_BASE_URL: z.string().default('https://services.leadconnectorhq.com'),
  GHL_WEBHOOK_SECRET: z.string().default(''),

  // Fathom (Fase 3) — each closer supplies their own personal API key at
  // runtime (see src/modules/fathom/routes.ts); this is only the shared API
  // base URL, not a credential.
  FATHOM_API_BASE_URL: z.string().default('https://api.fathom.ai/external/v1'),

  // Meta Ads — confirmed against developers.facebook.com/docs/marketing-api/insights.
  // Each Location supplies its own ad account id + a long-lived System User
  // access token (agency-standard for server-to-server reporting access,
  // avoids per-user Facebook Login/App Review for a read-only reporting
  // integration) — see src/modules/lanzamiento/metaAds/routes.ts.
  META_ADS_API_BASE_URL: z.string().default('https://graph.facebook.com/v21.0'),

  // Hotmart — OAuth2 client_credentials, confirmed against
  // developers.hotmart.com (App Authentication + Sales History pages).
  // Each Location supplies its own client_id/client_secret from Hotmart's
  // "Developer Credentials" tool — see src/modules/hotmart/routes.ts.
  HOTMART_OAUTH_URL: z.string().default('https://api-sec-vlc.hotmart.com/security/oauth/token'),
  HOTMART_API_BASE_URL: z.string().default('https://developers.hotmart.com/payments/api/v1'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. Check your .env against .env.example.');
}

export const env = parsed.data;
