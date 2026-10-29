# Build the Angular SPA and Express API for one-origin production serving.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca,mode=0444,required=true NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.build.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/migrate.ts ./scripts/migrate.ts
RUN npm run build
RUN test -f dist/web/browser/index.html && test -f dist/apps/api/src/server.js

FROM node:24-bookworm-slim AS runtime
RUN --mount=type=secret,id=build_ca,mode=0444,required=true sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::https::CaInfo=/run/secrets/build_ca update \
  && apt-get -o Acquire::https::CaInfo=/run/secrets/build_ca install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV BIND_HOST=0.0.0.0
ENV FORECAST_PYTHON=/usr/bin/python3
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca,mode=0444,required=true NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY packages/forecasting/runtime/worker.py ./packages/forecasting/runtime/worker.py
COPY migrations ./migrations
USER node
EXPOSE 3000
# Liveness only: database, forecasting and AI require separate acceptance checks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "const r=require('node:http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/api/v1/health'},s=>{s.resume();if(s.statusCode!==200)process.exitCode=1});r.setTimeout(4000,()=>r.destroy());r.on('error',()=>{process.exitCode=1})"
CMD ["node", "dist/apps/api/src/server.js"]
