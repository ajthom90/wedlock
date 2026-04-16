# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Base: shared OS layer with the native tooling Prisma's query engine needs.
# Keeping this in `base` (not each stage) means the apk layer is resolved once
# and reused by every downstream stage.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl


# ---------------------------------------------------------------------------
# deps: install npm packages. Invalidates only when package-lock.json changes.
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --no-audit / --no-fund skip two network round-trips that do nothing for us.
# --prefer-offline uses the BuildKit-mounted npm tarball cache first.
RUN --mount=type=cache,target=/root/.npm,id=npm \
    npm ci --no-audit --no-fund --prefer-offline


# ---------------------------------------------------------------------------
# builder: each COPY below is its own layer, ordered from least-frequently-
# changed (prisma schema) to most-frequently-changed (src/). A change to
# src/ won't bust the prisma generate layer above it.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# node_modules from deps. Content-addressable — no physical copy cost when
# the deps layer is cached.
COPY --from=deps /app/node_modules ./node_modules

# package metadata so next build can resolve the runtime version string.
COPY package.json package-lock.json ./

# Prisma schema → regenerate client. Cached unless schema.prisma changes.
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.cache/prisma,id=prisma \
    npx prisma generate

# Build-time config files. Rarely change; separating them from src/ keeps
# the src-changes path from invalidating the config-parsing layer.
# (next-env.d.ts is gitignored; next build regenerates it.)
COPY next.config.mjs tsconfig.json postcss.config.mjs tailwind.config.ts ./

# Static assets. Change occasionally.
COPY public ./public

# Source code. Changes most often — put last so everything above can cache.
COPY src ./src

# Next.js incremental build cache survives across builds, turning a full
# rebuild into an incremental one when many modules are unchanged.
RUN --mount=type=cache,target=/app/.next/cache,id=next \
    npm run build


# ---------------------------------------------------------------------------
# runner: minimal production image. Only copies what's needed at runtime.
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/wedding.db

RUN addgroup --system --gid 568 nodejs && \
    adduser --system --uid 568 nextjs

# Static assets served by next server.
COPY --from=builder /app/public ./public

# Prepare .next + uploads volume link.
RUN mkdir .next && chown nextjs:nodejs .next && \
    mkdir -p /data/uploads && chown -R nextjs:nodejs /data && \
    ln -sf /data/uploads ./public/uploads

# Next.js standalone output — smallest possible node server bundle.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma client + CLI (entrypoint runs `prisma db push` on start).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

VOLUME ["/data"]

CMD ["./docker-entrypoint.sh"]
