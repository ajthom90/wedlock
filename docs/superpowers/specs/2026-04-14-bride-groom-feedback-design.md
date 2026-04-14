# Bride & Groom Feedback — Design

**Date:** 2026-04-14
**Scope:** Three issues raised by the bride and groom after using the admin UI:

1. Scrolling photo banner above the "We're Getting Married" homepage hero.
2. Ability to insert pictures inside long-text content fields.
3. Pasted Google Maps links don't render — the embed iframe stays blank.

## Background

The site is a Next.js 14 App Router project with Prisma/SQLite, admin at `/admin`, and a `Photo` model that already supports `gallerySection` filtering and uploads via `/api/upload` (writes to `/data/uploads`).

The three issues all stem from limitations in the current stack:

- **Banner:** the homepage has no photo treatment — just a text hero. Photo infrastructure exists but isn't wired to the home page.
- **Content fields:** `Our Story`, `Details.schedule`, `Travel.travelInfo`, and `Event.description` are stored as plain strings and rendered with `whitespace-pre-line`. No markup is parsed.
- **Maps:** the admin field accepts any string and drops it directly into `<iframe src={mapUrl}>`. Google Maps enforces `X-Frame-Options: SAMEORIGIN` on everything *except* its dedicated embed URLs (`https://www.google.com/maps/embed?pb=...`). Regular share links (`maps.app.goo.gl`, `goo.gl/maps`, `/maps/place/...`) render blank.

## Goals

- Homepage gets a configurable banner (either photo-behind-text or photo-strip-above-text) that the couple can toggle from admin.
- Any long-text content field in the admin UI supports inline images and basic formatting through a WYSIWYG editor.
- Pasting any reasonable Google Maps link or plain address produces a working embedded map on the public site.
- HEIC/HEIF uploads from iPhones are accepted and auto-converted to JPG.
- Upload size cap raised from 5 MB to 10 MB site-wide.

## Non-goals

- No photo cropping / ordering UI for banner photos beyond what `/admin/photos` already provides (drag-reorder is already supported via `order` column).
- No FAQ answer rich-text support (can be added later if requested).
- No inline image support on the Hotel notes field or Dress Code field — those are one-liners.
- No Maps API key / paid Embed API integration. We rely on the free legacy `maps.google.com?output=embed` endpoint.
- No mobile-specific gesture support for the banner carousel (dots work on touch).

## Architecture Overview

Three loosely-coupled subsystems, each landable independently:

```
┌───────────────────────────────────────────────────────────────┐
│                     Upload foundation                         │
│  /api/upload: 10MB cap + HEIC→JPG conversion (heic-convert)   │
└──────────────┬──────────────────────────┬─────────────────────┘
               │                          │
               ▼                          ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│  HomeBanner subsystem     │   │  Rich text subsystem          │
│                           │   │                               │
│  Photo (existing) ────────┤   │  RichTextEditor (Tiptap, admin)│
│  gallerySection=          │   │  RichContent (sanitized HTML, │
│   "home-banner"           │   │    public)                    │
│  Setting:                 │   │  Wired into:                  │
│   site.homeBannerStyle    │   │   - content/ (story, schedule,│
│  HomeBanner.tsx           │   │     travelInfo)               │
│   (client component)      │   │   - events/ (description)     │
└───────────────────────────┘   └──────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Map URL subsystem                                            │
│  lib/mapUrl.ts: toEmbedUrl(input) — parses any GMaps variant  │
│  Consumed by details/page.tsx, events/page.tsx                │
│  Fallback: "View on Google Maps" button if unparseable        │
└──────────────────────────────────────────────────────────────┘
```

## Feature 1 — Home Banner

### Data

- **No schema change.** Banner photos live in the existing `Photo` table, filtered by `gallerySection = "home-banner"`.
- One new `Setting` row: `site.homeBannerStyle`, values `"hero"` or `"strip"`, default `"strip"`.

### Admin

- `/admin/settings` gets a new "Home Banner" card above the RSVP Settings card, containing a radio-group for style selection. Each radio option shows a small preview thumbnail (two static PNGs committed to `public/admin/banner-hero.png` and `public/admin/banner-strip.png`, each ~200×120).
- `/admin/photos` needs no changes; the couple picks "home-banner" from the existing `gallerySection` dropdown when uploading.

### Component: `src/components/public/HomeBanner.tsx`

Client component. Props:

```ts
type Props = {
  photos: Array<{ id: string; url: string; caption: string | null }>;
  style: 'hero' | 'strip';
  children: React.ReactNode; // the hero text block from page.tsx
};
```

Behavior:

- **0 photos:** render `children` only (falls back to today's hero).
- **1 photo:** render statically (no dots, no interval).
- **2+ photos:** cross-fade every 6 seconds; pagination dots at bottom, click to jump.
- **`prefers-reduced-motion: reduce`:** no auto-advance; user navigates via dots only.
- **Hero style:** absolute-positioned `<img>` layer with a `bg-black/40` overlay; `children` sits on top with white text shadow.
- **Strip style:** banner renders above `children`, no overlay, photos in a fixed-aspect container (~35vh tall).

### Homepage wiring

`src/app/(public)/page.tsx` fetches banner photos and the style setting server-side, passes them to `<HomeBanner>` which wraps the existing hero JSX.

### Edge cases

- Broken image URL → `onError` handler removes that photo from the rotation.
- Very wide/tall photos → `object-cover` + fixed aspect ratio keeps the layout stable.
- Photos added while page is cached → page uses `dynamic = 'force-dynamic'` already, so next visit gets them.

## Feature 2 — Rich Text Editor for Content Fields

### Editor choice: Tiptap

- MIT license, Prosemirror-based.
- ~40 KB with the extensions we need (StarterKit, Image, Link).
- Admin-bundle only; never ships to public pages.
- First-class Next.js 14 support.

Rejected alternatives: Lexical (heavier, less mature docs); Slate (more custom work); plain markdown editor (user chose WYSIWYG during brainstorming).

### Storage format

HTML strings. Sanitized on read, not on write, so we never lose data if the allowlist changes later.

### New component: `src/components/admin/RichTextEditor.tsx`

Client component. Toolbar: Bold, Italic, H2, H3, Bullet List, Numbered List, Link, Image, Undo, Redo. The Image button opens a hidden `<input type="file">`, POSTs to `/api/upload`, inserts an `<img>` node with the returned URL.

Props:

```ts
type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string; // default '200px'
};
```

### New component: `src/components/public/RichContent.tsx`

Server component. Takes `html: string` and renders it through a two-step pipeline:

1. **Sanitize** with `isomorphic-dompurify` against a strict allowlist (see below).
2. **Render** the sanitized output into the page.

**This is the critical safety boundary** — no HTML ever reaches the DOM without first passing through DOMPurify. No user input is rendered as markup except through this component.

Allowed tags: `p br strong em u h2 h3 ul ol li a img blockquote`.
Allowed attributes: `href target rel` on `<a>`; `src alt` on `<img>`.
Injected classes:
- `<img>` → `max-w-full h-auto rounded-lg my-4 mx-auto block`
- `<h2>` → `font-heading text-2xl mt-8 mb-4`
- `<h3>` → `font-heading text-xl mt-6 mb-3`
- `<ul>` → `list-disc pl-6 my-4`
- `<ol>` → `list-decimal pl-6 my-4`
- `<a>` → `text-primary hover:underline`, plus `target="_blank" rel="noopener noreferrer"`
- `<blockquote>` → `border-l-4 border-foreground/20 pl-4 italic my-4`

Note: all HTML in the database comes from authenticated admin users (the couple), so the attack surface is small — but we treat it as untrusted on principle, since admin credentials can leak and the DOMPurify cost is negligible.

### Migration for existing plain-text content

No DB migration. `RichContent` detects legacy plain text (content does not start with `<`) and converts at render time:

- Split on `\n\n` → wrap each chunk in `<p>`.
- Replace single `\n` inside each chunk with `<br>`.
- HTML-escape all plain-text input before wrapping.

When a user re-saves via Tiptap, the content becomes native HTML and the heuristic no-ops on next render.

### Admin wiring

Replace `<Textarea>` with `<RichTextEditor>` at these spots:

- `src/app/admin/(authenticated)/content/page.tsx` — Our Story `story` field, Details `schedule` field, Travel `travelInfo` field
- `src/app/admin/(authenticated)/events/page.tsx` — Event `description` field

Dress Code, Hotel name/address/phone/notes, and Hotel URL stay as `<Input>` — they're short single-line values.

### Public wiring

Replace `<div className="whitespace-pre-line">{content.xxx}</div>` with `<RichContent html={content.xxx ?? ''} />` in:

- `src/app/(public)/our-story/page.tsx`
- `src/app/(public)/details/page.tsx` (schedule)
- `src/app/(public)/travel/page.tsx` (travelInfo)
- `src/app/(public)/events/page.tsx` (description)

Note: `events/page.tsx` is currently a client component because it handles invitation-code gated access. Plan: convert the page shell to a server component and extract the invitation-code form into a `<EventsAccessForm>` client child. This keeps `RichContent` server-only, avoids shipping DOMPurify to the browser on that route, and simplifies data fetching.

## Feature 3 — Google Maps URL Auto-Conversion

### New utility: `src/lib/mapUrl.ts`

Single export: `async function toEmbedUrl(input: string): Promise<string | null>`.

### Parsing rules (in order)

| Input shape | Handling |
|---|---|
| Empty or whitespace | Return `null` |
| Starts with `https://www.google.com/maps/embed?pb=` | Return unchanged |
| Contains `@<lat>,<lng>` | Extract coords → `https://maps.google.com/maps?q=<lat>,<lng>&z=15&output=embed` |
| Has `?q=<query>` param | Extract `q` → `https://maps.google.com/maps?q=<encoded>&output=embed` |
| `/maps/place/<name>/…` | Extract `<name>` segment → URL-decode → build embed as above |
| `maps.app.goo.gl/*` or `goo.gl/maps/*` | `fetch(url, { redirect: 'follow', method: 'HEAD' })`, take the final URL, recurse through the rules above |
| Looks like plain text (no scheme) | `https://maps.google.com/maps?q=<encoded>&output=embed` |
| Anything else | Return `null` (caller falls back to button) |

Why the `maps.google.com?output=embed` form: this legacy endpoint renders inside iframes without requiring a paid Maps Embed API key. The modern `/maps/embed/v1/place` endpoint needs an API key.

### Storage

Stored value is unchanged — whatever the user typed. Normalization happens at render time, so if Google changes URL shapes in the future, fixing the parser fixes all existing records.

### Caching

In-memory `Map<string, string | null>` in `mapUrl.ts` module scope. Keys on raw input, values on resolved URL. Reset on server restart. Short-link resolution (`maps.app.goo.gl`) is the expensive path — 1 HTTP request per unique link per server process. Acceptable for a wedding site; revisit if load grows.

### Graceful fallback component

`src/components/public/VenueMap.tsx` — server component, takes `mapUrl: string | null`, calls `toEmbedUrl`. Renders:

- Iframe with resolved embed URL if parseable.
- Styled anchor button "📍 View on Google Maps" (target=_blank) if `toEmbedUrl` returns `null` but `mapUrl` is non-empty.
- Nothing if `mapUrl` is empty.

### Wiring

Replace existing `<iframe src={mapUrl}>` blocks with `<VenueMap mapUrl={...} />` at:

- `src/app/(public)/details/page.tsx` (global venue map)
- `src/app/(public)/events/page.tsx` (per-event map) — benefits from the same client/server refactor as the rich text work.

### Admin UX tweaks

Re-label field and helper text in:

- `src/app/admin/(authenticated)/settings/page.tsx` — global "Map Embed URL" → "Google Maps link"
- `src/app/admin/(authenticated)/events/page.tsx` — same

Helper text: "Paste any Google Maps link or a venue address. We'll convert it for display."

## Upload Foundation Changes

`src/app/api/upload/route.ts`:

- Bump `imageTypes` to include `'image/heic'`, `'image/heif'`, `'image/heic-sequence'`, `'image/heif-sequence'`.
- Bump size cap from `5 * 1024 * 1024` to `10 * 1024 * 1024`.
- After MIME/size validation, if incoming type is HEIC/HEIF: run buffer through `heic-convert` with `format: 'JPEG', quality: 0.9`, swap filename extension to `.jpg`, set written MIME to `image/jpeg`.
- Error messages updated to include HEIC and 10MB.

Dependency: `heic-convert` (MIT, pure JS, no native bindings — safe to add to the existing Node-based Docker image with no Dockerfile changes).

Copy updates in:
- `src/app/admin/(authenticated)/photos/page.tsx` upload-modal help text
- Tiptap image-button tooltip

## Testing Strategy

- **Unit tests** for `src/lib/mapUrl.ts` — table-driven tests for each URL shape, plus short-link resolution with a mocked `fetch`.
- **Unit tests** for the plain-text → HTML migration heuristic in `RichContent`.
- **Unit tests** confirming DOMPurify strips disallowed tags/attrs (e.g., `<script>`, `onclick=`, `javascript:` URLs).
- **Playwright happy-path tests:**
  - Upload a HEIC file via `/admin/photos`, confirm the resulting URL ends in `.jpg` and the image renders.
  - Toggle home banner between `hero` and `strip` in admin, visit `/`, confirm both layouts render.
  - Paste a `https://maps.app.goo.gl/...` link into an event map field, visit `/events`, confirm an iframe renders.
  - In the Our Story admin, type text, insert an image via the editor, save, visit `/our-story`, confirm the image appears inline.

## Build Order

Each step is independently mergeable:

1. **Upload foundation** (10MB + HEIC). Foundational — everything downstream assumes it.
2. **Map URL utility** (`mapUrl.ts` + `VenueMap.tsx` + wiring). Smallest, biggest win for the couple.
3. **Home Banner** (`HomeBanner.tsx` + settings wiring + admin radio).
4. **Rich Text Editor** (Tiptap integration + `RichContent` + migrations on 4 public pages + 2 admin pages).

## Open Questions

None. All tactical decisions (events page client/server split, migration heuristic, cache strategy, URL-parsing ordering) are resolved inline.
