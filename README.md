# Wedlock

A self-hosted wedding website — everything a couple needs to share their day with guests and coordinate the logistics behind it. Built with Next.js and SQLite so it runs comfortably on a small home server or VPS.

All content (couple names, dates, venues, events, photos, copy, colors, fonts) is editable from an admin UI at runtime. There's nothing couple-specific in the code — the same image ships to every deployer; each install configures itself through the admin panel.

## Features

### For guests

- **Home page** with a live countdown, rotating photo banner (arrow + swipe navigation), and a seven-day weather forecast for the venue in the final week.
- **Our Story** — rich-text narrative plus an optional timeline of relationship milestones.
- **Wedding Party** — configurable two-column layout (bride/groom sides, left/right swappable) plus a "supporting cast" section for officiants, ring bearers, readers, etc.
- **Details** — ceremony info, venue map, full event schedule (list or timeline view), dress code. Events can be marked "wedding-party only" and unlocked with an invitation code.
- **Travel & accommodations** — hotels, travel tips, venue driving directions.
- **Transportation** — per-route shuttle signup tied to each guest's invitation.
- **Registry** — external registry links plus an optional honeymoon fund with per-item goals and guest pledges.
- **Trivia** — multiple-choice trivia game about the couple with instant feedback.
- **Guest Book** — guest messages in off / public / moderated modes.
- **Photo Wall** — real-time reception photo wall with QR-code upload; optional admin moderation.
- **FAQ** — admin-managed question/answer list.
- **Seating chart** — searchable by name once assignments are published.
- **RSVP** — per-guest meal selection, dietary notes, song requests, plus-ones, plus any custom questions the couple defines. Change log retained per invitation.

### For the couple / admin

- **Invitations** — create households with max-guests + plus-one settings, mailing addresses, downloadable QR invitation cards (single or batch PDF).
- **RSVP dashboard** — see every response, edit submissions as an admin, view per-household change history.
- **Custom RSVP form** — add/remove/reorder extra questions beyond the built-in meal/dietary/song fields.
- **Events editor** — CRUD with times, venues, per-event maps, rich descriptions, visibility level.
- **Seating tables** — create tables, assign guests, publish to the public seating page.
- **Shuttles** — routes, capacity, guest signups.
- **Gifts registry tracker** — mark items purchased, track purchaser and thank-you status.
- **Honeymoon fund** — manage items and pledges; mark pledges as received.
- **Wedding party editor** — add members with bios, photo focal-point + zoom controls.
- **Story milestones** — timeline editor for the Our Story page.
- **Trivia editor** — build multiple-choice questions with explanations.
- **Photo wall moderation** — approve / reorder / remove uploaded photos.
- **Vendor directory** — private contact book for photographer, DJ, caterer, etc.
- **Budget tracker** — estimated vs. actual line items, paid status.
- **FAQ editor** — inline add/edit/reorder.
- **Page content editor** — rich-text CMS for the Our Story and Travel pages (with hotels sub-editor).
- **Banner editor** — choose home-page hero vs. strip layout, upload and order photos.
- **Media library** — upload photos and manage focal points; HEIC conversion on upload.

### Customization

- **Theme** — primary/accent/background colors, heading and body fonts.
- **Custom fonts** — upload `.woff2`/`.ttf`/`.otf` files and they appear in the font picker.
- **Navigation editor** — reorder, rename, hide, or nest any nav item (one level of dropdowns).
- **Feature flags** — toggle any major module on or off. When off, both the public page and the nav link disappear; when on, they return. Covers: per-guest meal selection, song requests, dietary notes, plus-ones, RSVP address, weather widget, story timeline, transportation, honeymoon fund, photo wall, trivia, guest photo uploads, guest book (off / public / moderated), vendor contacts, budget tracker, and site-wide password gate.
- **Site password gate** — optional global password to gate the public site.

### System

- Admin login with bcrypt password hash + brute-force lockout.
- SQLite DB bind-mounted into `/data` — trivial to back up (copy the file).
- Multi-arch Docker images (linux/arm64 + linux/amd64).
- Feature-flag-gated modules so unused parts vanish without touching code.
- `prefers-reduced-motion` respected on home banner rotation.

## Tech stack

Next.js 14 (App Router) · React 18 · Prisma · SQLite · Tailwind CSS · TipTap (rich text) · Vitest.

## Quick start — development

```bash
npm install
npx prisma db push        # creates dev.db from the schema
npx prisma db seed        # optional seed data
npm run dev
```

Visit `http://localhost:3000`. Admin is at `/admin/login` — the initial admin password is whatever `ADMIN_PASSWORD` is set to in your environment (see Deployment below).

## Quick start — Docker

A sample deployment compose file lives at `docker-compose.example.yml`. Copy it, edit the image tag, password, and bind-mount path, then:

```bash
cp docker-compose.example.yml docker-compose.yml
# edit docker-compose.yml
docker compose up -d
```

Data (SQLite DB + uploaded photos/fonts) persists under the bind-mounted `/data` volume — keep that directory around across image upgrades.

## Building your own images

`scripts/docker.sh` builds multi-arch images and pushes to one or more registries. Configure via a local `.env` file (not committed):

```bash
cp .env.example .env
# edit .env — set DOCKER_REGISTRIES
```

Then:

```bash
./scripts/docker.sh bump-patch   # 1.0.0 → 1.0.1, builds, pushes, writes new version into package.json
./scripts/docker.sh bump-minor
./scripts/docker.sh bump-major
./scripts/docker.sh build        # rebuild current version without pushing
./scripts/docker.sh push         # push current version
```

The script tags both `:VERSION` and `:latest` by default; pass `--no-latest` to skip the `:latest` tag.

## Configuration

Environment variables read by the container:

| Variable | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Password for `/admin/login`. Required. |
| `TZ` | IANA timezone, used for date/time display. Defaults to UTC. |

Everything else is configured through the admin UI at runtime.

## Testing

```bash
npx tsc --noEmit   # type check
npx vitest run     # unit tests
```

## Contributing

See `CLAUDE.md` for architecture conventions (feature flags, admin sidebar grouping, public nav nesting, DB migration policy, commit style).

## License

MIT — see `LICENSE`.
