# Wedlock — contributor guide

Next.js 14 + Prisma + SQLite wedding site. Couple-specific content lives in the DB; the code is a generic template. See `README.md` for the user-facing feature list.

## Project structure

- `src/app/(public)/` — guest-facing pages.
- `src/app/admin/(authenticated)/` — admin pages, gated by the login middleware.
- `src/app/api/` — API route handlers (all use `NextResponse`, Prisma for data).
- `src/components/public/` + `src/components/admin/` — UI components split by audience.
- `src/lib/settings.ts` — single source of truth for site settings + feature flags, read via `getSiteSettings()` / `getFeatures()`.
- `prisma/schema.prisma` — data model. SQLite.

## Feature flags

Every module added after the initial site is gated by a flag in `FeatureSettings` (see `src/lib/settings.ts`). Defaults are **on** except where noted. When a flag is off:

- The public page either `notFound()`s or hides its section in place.
- The public nav link is filtered out in `src/app/(public)/layout.tsx`.
- The admin sidebar item is filtered out in `src/components/admin/AdminNav.tsx` via the `feature` field.

Admins toggle flags at `/admin/features`.

New feature work should be flag-gated by default so deployers who don't want a module can hide it without touching code.

## Admin sidebar

Grouped, collapsible sidebar (`AdminNav.tsx`). Dashboard is pinned at the top; the rest is 7 groups: **Guests, Site Content, Media, Day Of, Money, Appearance, System**. Collapse state persists in `localStorage` under `admin-nav-collapsed-groups`; the group holding the active page auto-expands. First-time visitors see every group collapsed except the active one — keeps the sidebar scannable.

## Public nav nesting

`NavItem` model supports **one** level of nesting via `parentId`. A top-level item with `href = null` is a dropdown heading; its children are the actual links. Render caps at depth 2 — don't allow deeper nesting in the admin UI (the parent select on items-with-children is already disabled; keep it that way).

## Prisma / DB

SQLite. Schema changes should be additive so `npx prisma db push` (without `--force-reset`) is safe for existing installs. Never add a migration that drops guest data (RSVPs, guestbook entries, photos) without an explicit opt-in flag.

## Shipping a release

Versions live in `package.json`. Registries are configured per-deployer in `.env` (see `.env.example`). Use `./scripts/docker.sh`:

```
./scripts/docker.sh bump-patch     # 1.0.0 → 1.0.1
./scripts/docker.sh bump-minor     # 1.0.0 → 1.1.0
./scripts/docker.sh bump-major     # 1.0.0 → 2.0.0
```

The bump commands are one-shot: they rewrite `package.json`, commit as `Bump to vX.Y.Z`, tag `vX.Y.Z`, push `main` + tag to every git remote (which kicks off `.github/workflows/docker.yml` to build GHCR in parallel), then build multi-arch (linux/arm64 + linux/amd64) and push `:VERSION` + `:latest` to every entry in `DOCKER_REGISTRIES`. No separate commit step is needed.

**Add the release-notes.json entry BEFORE running bump-***: `release-notes.json` is copied into the Docker image at build time, so an entry added after the bump won't appear in the running container. If you forget, re-run `./scripts/docker.sh push` (no version change) to rebuild and overwrite the same tag with the corrected file.

For non-version-bump rebuilds (e.g. correcting bundled assets without a new version), use `./scripts/docker.sh push` — same image build + registry push, no git changes.

## Testing before shipping

- `npx tsc --noEmit` — type correctness.
- `npx vitest run` — unit tests (fast).

Lint (`next lint`) is not configured — don't try to run it interactively.

## Commit convention

- Short, sentence-case, imperative subject (~70 chars max).
- Prefer a small explanatory body for anything beyond a trivial fix.
- Keep refactors and features in separate commits from version bumps (`Bump to vX.Y.Z` as its own commit).
- Never `--no-verify` or amend published commits.
