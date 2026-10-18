# RigTracker: one container, one Node process serving the API and the built web app on port 4000.

FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter rigtracker-api build \
 && pnpm --filter rigtracker-web build
# Production-only node_modules for the API.
RUN pnpm --filter rigtracker-api deploy --prod --legacy /out/api \
 && rm -rf /out/api/dist /out/api/src /out/api/test \
 && cp -r api/dist /out/api/dist

FROM node:24-slim
# The release and commit, shown at /api/health and on Account: docker build --build-arg APP_VERSION=2.0.0-alpha.2+abc1234
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=$APP_VERSION \
    PORT=4000 \
    WEB_DIST=/app/web \
    UPLOADS_DIR=/app/uploads
WORKDIR /app/api
COPY --from=build /out/api ./
COPY --from=build /repo/web/dist /app/web
# Uploaded photos and videos: mount a volume here. Created owned by node so a new volume is writable.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Admin helpers: node dist/scripts/<name>.js (e.g. sign-in-link.js)
CMD ["node", "dist/main.js"]
