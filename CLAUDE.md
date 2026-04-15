# Joe & Alex wedding site

Next.js 14 / Prisma / SQLite wedding website. Two instances:
- **Production** — TrueNAS app named `Joe-and-Alex`.
- **Local dev** — `wedding2` Docker container on port **37428** (compose file at `/Users/ajthom90/projects/wedding2/docker-compose.yml`), used for testing releases before promoting to prod.

## Shipping a release

Versions live in `package.json`. Use `./scripts/docker.sh`:

```
./scripts/docker.sh bump-patch     # 2.6.0 → 2.6.1
./scripts/docker.sh bump-minor     # 2.6.0 → 2.7.0
./scripts/docker.sh bump-major     # 2.6.0 → 3.0.0
```

The script builds multi-arch (linux/arm64 + linux/amd64), pushes `:VERSION` + `:latest` to **both** registries:
- `forgejo.int.aafoods.com/ajthom90/joe-and-alex`
- `forgejo.home.njathome.net/ajthom90/joe-and-alex`

then writes the new version into `package.json` on success. It does **not** commit or tag — do that manually after the build:

```
git add package.json && git commit -m "Bump to vX.Y.Z"
git push origin main
cd /Users/ajthom90/projects/wedding2 && docker compose pull && docker compose up -d
```

The `docker compose pull && up -d` step is the local refresh step — always do it after a push so the user can smoke-test at http://localhost:37428 before promoting to prod.

## Commit convention

- Short, sentence-case, imperative subject (~70 chars max). Examples in recent log.
- **Every commit** ends with the `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` trailer. This is consistent across the log — do not skip it.
- Never `--no-verify` or amend published commits.

## Feature flags

Every module added after the initial site is gated by a flag in `FeatureSettings` (see `src/lib/settings.ts`). Defaults are **on** except where noted. When a flag is off:
- The public page either `notFound()`s or hides its section in place.
- The public nav link is filtered out in `src/app/(public)/layout.tsx`.
- The admin sidebar item is filtered out in `src/components/admin/AdminNav.tsx` via the `feature` field.

Admins toggle flags at `/admin/features`.

## Admin sidebar

Grouped, collapsible sidebar (`AdminNav.tsx`). Dashboard is pinned at the top; the rest is 7 groups: **Guests, Site Content, Media, Day Of, Money, Appearance, System**. Collapse state persists in `localStorage` under `admin-nav-collapsed-groups`; the group holding the active page auto-expands. Don't revert to a flat list — the grouping is intentional and the user asked for it.

## Public nav nesting

`NavItem` model supports **one** level of nesting via `parentId`. A top-level item with `href = null` is a dropdown heading; its children are the actual links. Render caps at depth 2 — don't allow deeper nesting in the admin UI (the parent select on items-with-children is already disabled; keep it that way).

## Prisma / DB

SQLite. Schema changes so far have all been additive, so `npx prisma db push` (without `--force-reset`) is safe. Never add a migration that drops data without asking.

## Testing before shipping

- `npx tsc --noEmit` for type correctness.
- `npx vitest run` for the unit tests (~30 of them, fast).
- After `docker compose up -d` on wedding2, `curl -sf http://localhost:37428/` to confirm HTTP 200.

Lint (`next lint`) is not configured — don't try to run it interactively.
