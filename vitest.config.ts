import { defineConfig } from 'vitest/config';

// Tests here are unit-level and deliberately don't touch Postgres/Redis (not
// available in every dev/CI environment) — see README "Tests" section. The
// env vars below only need to satisfy src/config/env.ts's format validation
// (zod), never an actual connection.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      APP_BASE_URL: 'http://localhost:4000',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-only-secret-not-for-production-use',
      TOKEN_ENCRYPTION_KEY: 'xt4OKUK7Xo7/5KE06rHmaHs42Hl0Ct/mVTc01Y0tYWc=',
    },
  },
});
