import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { authRouter } from './modules/auth/routes.js';
import { ghlWebhookRouter } from './modules/ghl/webhooks.js';
import { hotmartWebhookRouter } from './modules/hotmart/webhooks.js';
import { locationsRouter } from './modules/locations/routes.js';
import { dataRouter } from './modules/data/routes.js';
import { kpisRouter } from './modules/kpis/routes.js';
import { paymentsRouter } from './modules/payments/routes.js';
import { fathomRouter } from './modules/fathom/routes.js';
import { metaAdsRouter } from './modules/lanzamiento/metaAds/routes.js';
import { hotmartRouter } from './modules/hotmart/routes.js';
import { qualityRouter } from './modules/quality/routes.js';
import { settingsRouter } from './modules/settings/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { platformRouter } from './modules/platform/routes.js';
import { settersRouter } from './modules/lanzamiento/setters/routes.js';
import { launchesRouter } from './modules/lanzamiento/launches/routes.js';
import { assistantRouter } from './modules/assistant/routes.js';
import { teamRouter } from './modules/team/routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(pinoHttp({ logger }));

// The webhook route needs the raw request body to verify GHL's HMAC
// signature, so it gets its own json() call with a `verify` hook — mounted
// before the app-wide json() below.
app.use(
  '/webhooks/ghl',
  express.json({
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  }),
  ghlWebhookRouter,
);

app.use(express.json());

app.use('/webhooks/hotmart', hotmartWebhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/api/locations', locationsRouter);
app.use('/api', dataRouter);
app.use('/api/kpis', kpisRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/fathom', fathomRouter);
app.use('/api/meta-ads', metaAdsRouter);
app.use('/api/hotmart', hotmartRouter);
app.use('/api/quality', qualityRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile', usersRouter);
app.use('/api/platform', platformRouter);
app.use('/api/setters', settersRouter);
app.use('/api/launches', launchesRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/team', teamRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`ROISystem backend listening on ${env.APP_BASE_URL} (port ${env.PORT})`);
});
