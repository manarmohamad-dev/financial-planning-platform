# Build only the existing Express API and Python runtime; no frontend deployment.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig.json tsconfig.build.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/migrate.ts ./scripts/migrate.ts
RUN npm run build:api

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV FORECAST_PYTHON=/usr/bin/python3
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY packages/forecasting/runtime/worker.py ./packages/forecasting/runtime/worker.py
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/apps/api/src/server.js"]
