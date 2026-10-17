FROM node:24 AS builder
WORKDIR /app

# copy package manifests to leverage caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/
COPY web/package.json ./web/

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
# Install workspace deps required for both api and web
RUN pnpm install --frozen-lockfile --shamefully-hoist --filter ./api... --filter ./web...

COPY . .

WORKDIR /app
RUN pnpm --filter ./api run build
RUN pnpm --filter ./web run build

FROM node:24-slim AS runtime
WORKDIR /app

# Install nginx, curl and required system libs
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends nginx curl openssl libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Remove Debian default site and broken symlink to avoid duplicate default_server conflicts and runtime errors
RUN rm -f /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default || true

# Copy compiled server
COPY --from=builder /app/api/dist ./dist
# Copy workspace node_modules (pnpm places deps at workspace root)
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend into nginx html root
COPY --from=builder /app/web/dist /usr/share/nginx/html

# nginx config and entrypoint
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    HOST=127.0.0.1
EXPOSE 80
CMD ["/usr/local/bin/docker-entrypoint.sh"]
