# syntax=docker/dockerfile:1.7
# Build context is the repository root (see docker-compose.yml) because this
# is a pnpm workspace: the api package depends on the workspace lockfile and,
# eventually, packages/shared.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS fetch
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter api... --frozen-lockfile --ignore-scripts

FROM fetch AS build
# `prisma generate` only needs the schema, never a live connection, but
# prisma.config.ts requires DATABASE_URL to resolve at load time — including
# the second, redundant `prisma generate` that `pnpm deploy` triggers via our
# own postinstall hook when it reinstalls production deps below.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api run build
RUN pnpm deploy --legacy --filter api --prod /prod/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /data/documents && chown -R app:app /data/documents
WORKDIR /app
COPY --from=build /prod/api ./
RUN chmod +x ./docker-entrypoint.sh && rm -f ./prisma/seed.ts
USER app
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
