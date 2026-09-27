# syntax=docker/dockerfile:1.7
# Build context is the repository root (see docker-compose.yml).

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter web... --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter web run build

FROM caddy:2-alpine
# The upstream binary already has cap_net_bind_service set (see
# caddyserver/caddy-docker), so a non-root user can still bind :80/:443.
RUN addgroup -S caddy && adduser -S -G caddy caddy \
    && mkdir -p /data /config && chown -R caddy:caddy /data /config
COPY --from=build --chown=caddy:caddy /repo/apps/web/dist /srv
COPY --chown=caddy:caddy deploy/caddy/Caddyfile /etc/caddy/Caddyfile
USER caddy
