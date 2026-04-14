FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
# Cache the npm tarball cache across builds so we aren't re-downloading
# ~100MB of packages on every container rebuild. Keyed per-arch automatically
# by BuildKit (each platform gets its own cache).
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma downloads engine binaries into ~/.cache/prisma — cache that too.
RUN --mount=type=cache,target=/root/.cache/prisma npx prisma generate
# Next.js stores its incremental build cache in .next/cache. Keeping it warm
# turns a full rebuild into an incremental one when most of the code is
# unchanged (typical for small patches).
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM base AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 568 nodejs
RUN adduser --system --uid 568 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

RUN mkdir -p /data/uploads && chown -R nextjs:nodejs /data
RUN ln -sf /data/uploads ./public/uploads

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/data/wedding.db

VOLUME ["/data"]

CMD ["./docker-entrypoint.sh"]
