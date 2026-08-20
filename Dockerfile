FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 4000

# `prisma migrate deploy` is idempotent — safe to run on every boot, applies
# any migrations that haven't run yet. Only the backend service runs it (see
# deploy notes); the worker service overrides CMD to skip straight to
# `node dist/jobs/worker.js` so two containers don't race to migrate.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
