# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Base: shared OS layer with the native tooling Prisma's query engine needs.
# Keeping this in `base` (not each stage) means the apk layer is resolved once
# and reused by every downstream stage.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl


# ---------------------------------------------------------------------------
# deps: install all deps (dev + prod) for the build. Invalidates only when
# package-lock.json changes.
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=npm \
    npm ci --no-audit --no-fund --prefer-offline


# ---------------------------------------------------------------------------
# prod-deps: production-only deps for the runtime image. Runs `prisma generate`
# here so node_modules/.prisma ends up in the same tree we'll copy to runner.
# This stage is why `prisma` lives in `dependencies`, not `devDependencies` —
# the CLI (+ its transitive runtime deps like @prisma/config and `effect`) is
# needed at container start for `prisma db push` in docker-entrypoint.sh.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=npm \
    npm ci --omit=dev --no-audit --no-fund --prefer-offline
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.cache/prisma,id=prisma \
    npx prisma generate


# ---------------------------------------------------------------------------
# builder: each COPY below is its own layer, ordered from least-frequently-
# changed (prisma schema) to most-frequently-changed (src/). A change to
# src/ won't bust the prisma generate layer above it.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.cache/prisma,id=prisma \
    npx prisma generate

# (next-env.d.ts is gitignored; next build regenerates it.)
COPY next.config.mjs tsconfig.json postcss.config.mjs tailwind.config.ts ./
# release-notes.json is imported by src/lib/releaseNotes.ts at build time
# and inlined into the bundle — the container doesn't need it at runtime.
COPY release-notes.json ./
COPY public ./public
COPY src ./src

RUN --mount=type=cache,target=/app/.next/cache,id=next \
    npm run build


# ---------------------------------------------------------------------------
# runner: minimal production image. Next.js standalone output layered over
# the pruned production node_modules from prod-deps.
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

RUN mkdir .next && chown nextjs:nodejs .next && \
    mkdir -p /data/uploads && chown -R nextjs:nodejs /data

# Production node_modules first (includes prisma CLI + every transitive dep
# the entrypoint migration step needs at runtime).
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Prisma schema lives next to the app — `prisma db push` reads it relative
# to cwd at container start.
COPY --from=prod-deps --chown=nextjs:nodejs /app/prisma ./prisma

# Next.js build output: the standalone server bundle + static assets + public.
# server.js / package.json come from the standalone output; node_modules in
# it is a subset of prod-deps (which we've already placed) so no conflict.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Guest uploads share the /data volume with SQLite so they persist across
# image upgrades. Symlinked after public/ is in place.
RUN ln -sf /data/uploads ./public/uploads

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

VOLUME ["/data"]

CMD ["./docker-entrypoint.sh"]
