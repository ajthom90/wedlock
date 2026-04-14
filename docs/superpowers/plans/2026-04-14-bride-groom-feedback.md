# Bride & Groom Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address three pieces of feedback from the bride and groom — add a configurable scrolling photo banner to the homepage, allow inline images inside rich-text content fields, and make any Google Maps link (not just embed URLs) render correctly.

**Architecture:** Four independently-shippable phases. Phase 0 sets up Vitest for pure-function unit tests. Phase 1 upgrades the existing `/api/upload` route to accept HEIC/HEIF and raise the size cap to 10 MB. Phase 2 adds a URL-normalization utility and a `VenueMap` component that falls back to a "View on Google Maps" button when the URL can't be embedded. Phase 3 introduces a `HomeBanner` component driven by existing `Photo` records filtered by `gallerySection = "home-banner"`, with an admin toggle between `hero` and `strip` layouts. Phase 4 replaces every `<Textarea>` for long-form content with a Tiptap editor and renders stored HTML on public pages through a sanitized `RichContent` component.

**Tech Stack:** Next.js 14 App Router, Prisma + SQLite, TypeScript, Tailwind CSS. New runtime deps: `heic-convert`, `isomorphic-dompurify`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`. New dev dep: `vitest` and `@vitest/ui`.

**Spec:** `docs/superpowers/specs/2026-04-14-bride-groom-feedback-design.md`

---

## File Structure

### New files

| Path | Responsibility | Phase |
|---|---|---|
| `vitest.config.ts` | Vitest configuration | 0 |
| `src/lib/mapUrl.ts` | Pure function: normalize any Google Maps URL / address into an iframe-safe embed URL | 2 |
| `src/lib/mapUrl.test.ts` | Unit tests for `toEmbedUrl` | 2 |
| `src/components/public/VenueMap.tsx` | Server component: renders iframe or fallback link | 2 |
| `src/lib/renderContent.ts` | Pure functions: plain-text → HTML migration, DOMPurify sanitization | 4 |
| `src/lib/renderContent.test.ts` | Unit tests for `renderContent` | 4 |
| `src/components/public/RichContent.tsx` | Server component: renders sanitized HTML via `renderContent` | 4 |
| `src/components/admin/RichTextEditor.tsx` | Client component: Tiptap-based WYSIWYG editor with image upload | 4 |
| `src/components/public/HomeBanner.tsx` | Client component: cross-fading photo banner with hero/strip style modes | 3 |
| `src/components/public/EventsAccessForm.tsx` | Client component: extracted invitation-code form for events page | 4 |

### Modified files

| Path | Change | Phase |
|---|---|---|
| `package.json` | Add deps + test scripts | 0, 1, 4 |
| `src/app/api/upload/route.ts` | 10 MB cap + HEIC/HEIF conversion | 1 |
| `src/app/admin/(authenticated)/photos/page.tsx` | Update help text for allowed formats + size | 1 |
| `src/app/(public)/details/page.tsx` | Swap iframe for `<VenueMap>`; swap schedule `<div>` for `<RichContent>` | 2, 4 |
| `src/app/(public)/events/page.tsx` | Convert to server component; use `<VenueMap>` and `<RichContent>` | 2, 4 |
| `src/app/admin/(authenticated)/settings/page.tsx` | Relabel Map field + helper text; add Home Banner card | 2, 3 |
| `src/app/admin/(authenticated)/events/page.tsx` | Relabel Map field; swap description Textarea for `<RichTextEditor>` | 2, 4 |
| `src/lib/settings.ts` | Add `homeBannerStyle` to `SiteSettings` type + defaults | 3 |
| `src/app/(public)/page.tsx` | Fetch banner photos + setting, wrap hero in `<HomeBanner>` | 3 |
| `src/app/admin/(authenticated)/content/page.tsx` | Replace story/schedule/travelInfo textareas with `<RichTextEditor>` | 4 |
| `src/app/(public)/our-story/page.tsx` | Use `<RichContent>` for story | 4 |
| `src/app/(public)/travel/page.tsx` | Use `<RichContent>` for travelInfo | 4 |

---

## Phase 0 — Test Infrastructure

The repository currently has no test runner. Vitest is lightweight, fast, and works with Next.js 14 TypeScript out of the box. We're adding it only for pure-function tests (URL parsing, sanitization). Component and integration tests remain manual throughout this plan.

### Task 0.1: Add Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install --save-dev vitest @vitest/ui`
Expected: packages added to `devDependencies`, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

Create `/Users/ajthom90/projects/joe-and-alex/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

In `package.json`, under `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify empty run succeeds**

Run: `npm test`
Expected: "No test files found" (exit 0 or similar — not an install/config error).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Vitest for unit tests"
```

---

## Phase 1 — Upload Foundation

Raise the size cap from 5 MB to 10 MB site-wide and accept HEIC/HEIF uploads (common on iPhones), converting them to JPEG on the server.

### Task 1.1: Install `heic-convert`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependency**

Run: `npm install heic-convert`
Expected: package added to `dependencies`. `heic-convert` is pure JS — no native-bindings errors.

- [ ] **Step 2: Verify install**

Run: `node -e "console.log(typeof require('heic-convert'))"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add heic-convert dependency"
```

### Task 1.2: Update `/api/upload` route

**Files:**
- Modify: `src/app/api/upload/route.ts`

- [ ] **Step 1: Replace the entire file contents**

Replace `src/app/api/upload/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import heicConvert from 'heic-convert';

const imageTypes = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];
const heicTypes = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const fontTypes = [
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-opentype',
  'application/vnd.ms-fontobject',
];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FONT_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const isFont = type === 'font';
    const allowedTypes = isFont ? fontTypes : imageTypes;
    const maxBytes = isFont ? MAX_FONT_BYTES : MAX_IMAGE_BYTES;

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed: ${
            isFont ? 'font (WOFF, WOFF2, TTF, OTF)' : 'image (JPG, PNG, GIF, WebP, HEIC)'
          }`,
        },
        { status: 400 },
      );
    }
    if (file.size > maxBytes) {
      const maxMb = maxBytes / (1024 * 1024);
      return NextResponse.json({ error: `File too large. Maximum size is ${maxMb}MB` }, { status: 400 });
    }

    let buffer = Buffer.from(await file.arrayBuffer());
    let ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';

    // HEIC/HEIF → JPEG conversion
    if (heicTypes.has(file.type)) {
      const converted = await heicConvert({
        buffer: buffer as unknown as ArrayBufferLike,
        format: 'JPEG',
        quality: 0.9,
      });
      buffer = Buffer.from(converted);
      ext = 'jpg';
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${ext}`;
    const uploadDir = '/data/uploads';
    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({ success: true, url: `/uploads/${filename}`, filename, size: buffer.length });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify a JPEG upload still works**

Start dev server in one terminal: `npm run dev`

In another terminal (adjust path to a local JPEG):

```bash
curl -b cookie.txt -F "file=@/path/to/test.jpg" http://localhost:3000/api/upload
```

Expected: JSON with `{"success":true,"url":"/uploads/..."}`. If unauthenticated, first log in at `/admin/login` and save cookies via `-c cookie.txt` on that login request.

- [ ] **Step 4: Manually verify size limit**

Create a 12 MB dummy file: `dd if=/dev/zero of=/tmp/big.jpg bs=1M count=12`
Upload it: `curl -b cookie.txt -F "file=@/tmp/big.jpg" http://localhost:3000/api/upload`
Expected: JSON with `{"error":"File too large. Maximum size is 10MB"}` and HTTP 400.

Note: the dummy file has `.jpg` extension but isn't a valid JPEG. That's fine — the size check runs before any decoding.

- [ ] **Step 5: Manually verify HEIC upload converts to JPG**

Use a real HEIC file from an iPhone, or download a sample: `curl -Lo /tmp/sample.heic https://github.com/strukturag/libheif/raw/master/examples/example.heic`

Upload: `curl -b cookie.txt -F "file=@/tmp/sample.heic" http://localhost:3000/api/upload`

Expected: JSON response with `"url": "/uploads/<timestamp>-<random>.jpg"` (note `.jpg` extension). Visit the URL in a browser to confirm the file displays.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "Raise upload cap to 10MB and auto-convert HEIC/HEIF to JPEG"
```

### Task 1.3: Update admin photos UI copy

**Files:**
- Modify: `src/app/admin/(authenticated)/photos/page.tsx`

- [ ] **Step 1: Add helper text below the file input**

Find the file input block (around the "Image File" label) and add a helper paragraph below it:

```tsx
<div>
  <label className="block text-sm font-medium mb-1">Image File</label>
  <input
    type="file"
    accept="image/*"
    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
  />
  <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP, or HEIC — up to 10 MB. HEIC files are converted to JPG automatically.</p>
</div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify in the browser**

Visit `/admin/photos` (logged in), click "Add Photo", confirm the helper text appears below the file input.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/\(authenticated\)/photos/page.tsx
git commit -m "Document HEIC support and 10MB limit in photos admin"
```

---

## Phase 2 — Google Maps URL Auto-Conversion

Add a utility that normalizes any Google Maps URL or plain address into a URL safe to use in an iframe. Wrap the iframe in a component that falls back to a "View on Google Maps" button when normalization fails.

### Task 2.1: Write `toEmbedUrl` with tests (TDD)

**Files:**
- Create: `src/lib/mapUrl.test.ts`
- Create: `src/lib/mapUrl.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/ajthom90/projects/joe-and-alex/src/lib/mapUrl.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toEmbedUrl } from './mapUrl';

describe('toEmbedUrl', () => {
  beforeEach(() => {
    // @ts-expect-error - clear test cache between runs
    globalThis.__mapUrlCache?.clear?.();
  });

  it('returns null for empty input', async () => {
    expect(await toEmbedUrl('')).toBeNull();
    expect(await toEmbedUrl('   ')).toBeNull();
  });

  it('returns embed URLs unchanged', async () => {
    const embed = 'https://www.google.com/maps/embed?pb=!1m18!abc';
    expect(await toEmbedUrl(embed)).toBe(embed);
  });

  it('extracts @lat,lng coordinates from place URLs', async () => {
    const url = 'https://www.google.com/maps/place/Napa+Valley/@38.5025,-122.2654,14z';
    const result = await toEmbedUrl(url);
    expect(result).toBe('https://maps.google.com/maps?q=38.5025,-122.2654&z=15&output=embed');
  });

  it('extracts ?q= query param', async () => {
    const url = 'https://www.google.com/maps/?q=Space+Needle+Seattle';
    const result = await toEmbedUrl(url);
    expect(result).toBe('https://maps.google.com/maps?q=Space%20Needle%20Seattle&output=embed');
  });

  it('extracts place name from /maps/place/ path', async () => {
    const url = 'https://www.google.com/maps/place/The+Riverhouse+Estate';
    const result = await toEmbedUrl(url);
    expect(result).toBe('https://maps.google.com/maps?q=The%20Riverhouse%20Estate&output=embed');
  });

  it('treats plain-text input as a search query', async () => {
    const result = await toEmbedUrl('123 Vineyard Ln, Napa CA');
    expect(result).toBe('https://maps.google.com/maps?q=123%20Vineyard%20Ln%2C%20Napa%20CA&output=embed');
  });

  it('follows maps.app.goo.gl redirects', async () => {
    const short = 'https://maps.app.goo.gl/abc123';
    const long = 'https://www.google.com/maps/place/Test+Venue/@40.0,-75.0,15z';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      url: long,
      ok: true,
    } as Response);
    try {
      const result = await toEmbedUrl(short);
      expect(result).toBe('https://maps.google.com/maps?q=40.0,-75.0&z=15&output=embed');
      expect(fetchSpy).toHaveBeenCalledWith(short, expect.objectContaining({ redirect: 'follow' }));
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns null when short-link fetch fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    try {
      expect(await toEmbedUrl('https://maps.app.goo.gl/broken')).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('caches resolved URLs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      url: 'https://www.google.com/maps/place/Cached/@10,20,15z',
      ok: true,
    } as Response);
    try {
      await toEmbedUrl('https://maps.app.goo.gl/cachekey');
      await toEmbedUrl('https://maps.app.goo.gl/cachekey');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run the tests — expect failures**

Run: `npm test -- mapUrl`
Expected: all tests fail with "Cannot find module './mapUrl'" or equivalent.

- [ ] **Step 3: Implement `toEmbedUrl` to pass the tests**

Create `/Users/ajthom90/projects/joe-and-alex/src/lib/mapUrl.ts`:

```ts
const cache = new Map<string, string | null>();

const EMBED_PREFIX = 'https://www.google.com/maps/embed?pb=';
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);

function buildEmbedFromQuery(query: string, zoom?: number): string {
  const z = zoom ? `&z=${zoom}` : '';
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}${z}&output=embed`;
}

function buildEmbedFromCoords(lat: string, lng: string): string {
  // Don't URL-encode the comma between lat/lng — Google Maps requires it literal.
  return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
}

function parseParsedUrl(url: URL): string | null {
  // Rule: @lat,lng,zoom in path
  const coordMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (coordMatch) return buildEmbedFromCoords(coordMatch[1], coordMatch[2]);

  // Rule: ?q=... query param
  const q = url.searchParams.get('q');
  if (q) return buildEmbedFromQuery(q);

  // Rule: /maps/place/<name>/...
  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeMatch) {
    const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    return buildEmbedFromQuery(decoded);
  }

  return null;
}

async function resolveShortLink(shortUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shortUrl, { redirect: 'follow', method: 'GET' });
    // fetch resolves to the final URL in `res.url` after following redirects.
    if (res.url && res.url !== shortUrl) return res.url;
    return null;
  } catch {
    return null;
  }
}

export async function toEmbedUrl(input: string): Promise<string | null> {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  if (cache.has(trimmed)) return cache.get(trimmed)!;

  const result = await resolveImpl(trimmed);
  cache.set(trimmed, result);
  return result;
}

async function resolveImpl(input: string): Promise<string | null> {
  // Already an embed URL.
  if (input.startsWith(EMBED_PREFIX)) return input;

  // Looks like a URL at all?
  let url: URL | null = null;
  try {
    url = new URL(input);
  } catch {
    // Not a URL — treat as a plain-text search query.
    return buildEmbedFromQuery(input);
  }

  // Short link — follow redirect, then recurse.
  if (SHORT_HOSTS.has(url.hostname)) {
    const resolved = await resolveShortLink(input);
    if (!resolved) return null;
    // Parse the resolved URL directly (don't store the intermediate in cache).
    try {
      const resolvedUrl = new URL(resolved);
      return parseParsedUrl(resolvedUrl);
    } catch {
      return null;
    }
  }

  return parseParsedUrl(url);
}

// Test helper: expose cache for clearing between tests.
// @ts-expect-error - globalThis augmentation for tests only
globalThis.__mapUrlCache = cache;
```

- [ ] **Step 4: Run the tests — expect pass**

Run: `npm test -- mapUrl`
Expected: all 9 tests pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mapUrl.ts src/lib/mapUrl.test.ts
git commit -m "Add toEmbedUrl utility for Google Maps URL normalization"
```

### Task 2.2: Create `VenueMap` component

**Files:**
- Create: `src/components/public/VenueMap.tsx`

- [ ] **Step 1: Create the component**

Create `/Users/ajthom90/projects/joe-and-alex/src/components/public/VenueMap.tsx`:

```tsx
import { toEmbedUrl } from '@/lib/mapUrl';

interface Props {
  mapUrl: string | null | undefined;
  title?: string;
}

export async function VenueMap({ mapUrl, title }: Props) {
  if (!mapUrl || !mapUrl.trim()) return null;

  const embedUrl = await toEmbedUrl(mapUrl);

  if (embedUrl) {
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden">
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={title || 'Venue location map'}
        />
      </div>
    );
  }

  // Fallback: couldn't parse — render a button linking to the original URL.
  return (
    <div className="text-center">
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-white hover:bg-primary/90 transition-colors"
      >
        <span aria-hidden="true">📍</span>
        <span>View on Google Maps</span>
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/public/VenueMap.tsx
git commit -m "Add VenueMap component with iframe + fallback link"
```

### Task 2.3: Wire `VenueMap` into the Details page

**Files:**
- Modify: `src/app/(public)/details/page.tsx`

- [ ] **Step 1: Replace the map section**

Find the block starting with `{settings.mapUrl && (` (around line 45) and replace the entire `<section>` with:

```tsx
{settings.mapUrl && (
  <section className="text-center">
    <h2 className="text-2xl font-heading font-semibold mb-4">Venue Map</h2>
    <div className="max-w-2xl mx-auto">
      <VenueMap mapUrl={settings.mapUrl} title="Venue location map" />
    </div>
  </section>
)}
```

Then at the top of the file add the import:

```tsx
import { VenueMap } from '@/components/public/VenueMap';
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Start the dev server if it isn't running. In admin Settings, paste the following values one at a time into "Map Embed URL" and visit `/details` after saving each:

1. **An existing embed URL** (if you have one) — should render an iframe.
2. **A plain address**, e.g. `Space Needle, Seattle WA` — should render an iframe showing that location.
3. **A `/maps/place/...` URL** — grab one from Google Maps → Share → Copy link.
4. **A `maps.app.goo.gl/...` short URL** — from Google Maps app share.

For each, confirm the iframe shows the right place.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(public\)/details/page.tsx
git commit -m "Use VenueMap on details page"
```

### Task 2.4: Convert Events page to server component + extract invitation form

**Files:**
- Create: `src/components/public/EventsAccessForm.tsx`
- Modify: `src/app/(public)/events/page.tsx`

The existing Events page is a client component because it handles an invitation-code form that controls which events are visible. To use `<VenueMap>` (server component) and later `<RichContent>` (server component) without leaking DOMPurify into the client bundle, convert the page to a server component and move only the form into a client child.

- [ ] **Step 1: Extract the invitation-code form**

Create `/Users/ajthom90/projects/joe-and-alex/src/components/public/EventsAccessForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function EventsAccessForm() {
  const router = useRouter();
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setSubmitting(true);
    setCodeError('');
    try {
      const res = await fetch(`/api/events?code=${encodeURIComponent(codeInput.trim())}`);
      if (!res.ok) {
        setCodeError('Invalid invitation code. Please try again.');
        return;
      }
      // Cookie is set server-side by /api/events; refresh to pick up wedding-party events.
      router.refresh();
    } catch {
      setCodeError('Could not verify code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mb-10 p-4 border border-foreground/10 rounded-lg bg-background">
      <p className="text-sm text-foreground/70 mb-3">Enter your invitation code to see all events</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Invitation code"
          className="flex-1 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? '...' : 'Submit'}
        </button>
      </form>
      {codeError && <p className="text-sm text-red-500 mt-2">{codeError}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Replace the Events page with a server component**

Replace the entire contents of `/Users/ajthom90/projects/joe-and-alex/src/app/(public)/events/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { formatDate, formatTime } from '@/lib/utils';
import { VenueMap } from '@/components/public/VenueMap';
import { EventsAccessForm } from '@/components/public/EventsAccessForm';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const cookieStore = await cookies();
  const rsvpCookie = cookieStore.get('rsvp_code');

  let hasValidCode = false;
  if (rsvpCookie?.value) {
    const invitation = await prisma.invitation.findUnique({ where: { code: rsvpCookie.value } });
    if (invitation) hasValidCode = true;
  }

  const events = await prisma.event.findMany({
    where: hasValidCode ? undefined : { visibility: 'public' },
    orderBy: { order: 'asc' },
  });

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Events</h1>

      {!hasValidCode && <EventsAccessForm />}

      <div className="max-w-4xl mx-auto">
        {events.length === 0 ? (
          <p className="text-center text-foreground/60 py-8">Event schedule coming soon!</p>
        ) : (
          <div className="space-y-8">
            {events.map((event) => (
              <article key={event.id} className="border border-foreground/10 rounded-lg overflow-hidden">
                <div className="p-6 md:p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-2xl font-heading font-semibold text-primary">{event.name}</h2>
                    {event.visibility === 'wedding-party' && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                        Wedding Party Only
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-foreground/80 mb-4">
                    {event.date && (
                      <p className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-foreground/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>{formatDate(event.date)}</span>
                      </p>
                    )}
                    {event.time && (
                      <p className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-foreground/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          {formatTime(event.time)}
                          {event.endTime && ` – ${formatTime(event.endTime)}`}
                        </span>
                      </p>
                    )}
                    {event.venueName && (
                      <p className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-foreground/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>
                          {event.venueName}
                          {event.venueAddress && (
                            <>
                              <br />
                              <span className="text-foreground/60 text-sm">{event.venueAddress}</span>
                            </>
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-foreground/70 leading-relaxed whitespace-pre-line">{event.description}</p>
                  )}
                </div>
                {event.mapUrl && (
                  <div className="border-t border-foreground/10 p-0">
                    <VenueMap mapUrl={event.mapUrl} title={`Map for ${event.name}`} />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

Note: the event description stays as `whitespace-pre-line` for now. Phase 4 swaps it to `<RichContent>`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify the events page**

1. Visit `/events` with no invitation cookie → only public events appear, and the invitation form shows.
2. Type a valid invitation code (use an existing one from `/admin/invitations`) → form submits, page refreshes, wedding-party events appear.
3. For events with a `mapUrl` set, confirm the map renders (iframe or fallback button).

- [ ] **Step 5: Commit**

```bash
git add src/components/public/EventsAccessForm.tsx src/app/\(public\)/events/page.tsx
git commit -m "Convert events page to server component and use VenueMap"
```

### Task 2.5: Update admin map field labels

**Files:**
- Modify: `src/app/admin/(authenticated)/settings/page.tsx`
- Modify: `src/app/admin/(authenticated)/events/page.tsx`

The settings page currently has no visible Map URL field in the UI (the type includes `mapUrl` but the rendered form doesn't). Double-check this before editing — we may need to either add the field or relabel an existing one.

- [ ] **Step 1: Confirm the settings Map URL field**

Run: `grep -n "mapUrl\|Map" src/app/admin/\(authenticated\)/settings/page.tsx`

If no input is rendered for `mapUrl`, follow Step 2A. If one is, follow Step 2B.

- [ ] **Step 2A: If no `mapUrl` input exists, add one to the settings page**

Find the Couple Information card and, immediately after the wedding date/time grid div, add these fields inside the same `CardContent`:

```tsx
<div>
  <label className="block text-sm font-medium mb-1">Venue Name</label>
  <Input
    value={settings.venueName}
    onChange={(e) => update('venueName', e.target.value)}
    placeholder="e.g., The Riverhouse Estate"
  />
</div>
<div>
  <label className="block text-sm font-medium mb-1">Venue Address</label>
  <Input
    value={settings.venueAddress}
    onChange={(e) => update('venueAddress', e.target.value)}
    placeholder="Street, City, State ZIP"
  />
</div>
<div>
  <label className="block text-sm font-medium mb-1">Google Maps link</label>
  <Input
    value={settings.mapUrl}
    onChange={(e) => update('mapUrl', e.target.value)}
    placeholder="https://maps.app.goo.gl/..."
  />
  <p className="text-xs text-gray-500 mt-1">Paste any Google Maps link or a venue address. We&apos;ll convert it for display.</p>
</div>
```

- [ ] **Step 2B: If `mapUrl` input exists, relabel its `<label>` and helper text**

Replace the existing label and placeholder with:

```tsx
<label className="block text-sm font-medium mb-1">Google Maps link</label>
<Input
  value={settings.mapUrl}
  onChange={(e) => update('mapUrl', e.target.value)}
  placeholder="https://maps.app.goo.gl/..."
/>
<p className="text-xs text-gray-500 mt-1">Paste any Google Maps link or a venue address. We&apos;ll convert it for display.</p>
```

- [ ] **Step 3: Update the events admin page label**

In `src/app/admin/(authenticated)/events/page.tsx`, find the block starting with `<label className="block text-sm font-medium mb-1">Map Embed URL</label>` (around line 273) and replace that whole div with:

```tsx
<div>
  <label className="block text-sm font-medium mb-1">Google Maps link</label>
  <Input
    value={form.mapUrl}
    onChange={(e) => updateForm('mapUrl', e.target.value)}
    placeholder="https://maps.app.goo.gl/..."
  />
  <p className="text-xs text-gray-500 mt-1">Paste any Google Maps link or a venue address. We&apos;ll convert it for display.</p>
</div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify**

Visit `/admin/settings` and `/admin/events` (open an event for edit). Confirm both labels now say "Google Maps link" and include the helper text.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/\(authenticated\)/settings/page.tsx src/app/admin/\(authenticated\)/events/page.tsx
git commit -m "Relabel Map URL fields to accept any Google Maps link"
```

---

## Phase 3 — Home Banner

Add a scrolling photo banner to the homepage, configurable by the couple between two layouts.

### Task 3.1: Add `homeBannerStyle` to settings

**Files:**
- Modify: `src/lib/settings.ts`

- [ ] **Step 1: Add the field to the types and defaults**

In `src/lib/settings.ts`:

1. Add `homeBannerStyle: 'hero' | 'strip';` to the `SiteSettings` interface.
2. Add `homeBannerStyle: 'strip',` to the `defaultSite` constant.
3. Update the `getSiteSettings` parsing loop to handle the new key — since it's a string, no special parsing is needed; the existing `else` branch handles it. But add a guard so invalid values fall back to `'strip'`:

```ts
} else if (key === 'homeBannerStyle') {
  (site as any)[key] = setting.value === 'hero' ? 'hero' : 'strip';
} else {
  (site as any)[key] = setting.value;
}
```

Final `SiteSettings` interface should look like:

```ts
export interface SiteSettings {
  coupleName1: string;
  coupleName2: string;
  weddingDate: string;
  weddingTime: string;
  venueName: string;
  venueAddress: string;
  registryLinks: { name: string; url: string }[];
  rsvpDeadline: string;
  rsvpCloseAfterDeadline: boolean;
  qrCardWidth: number;
  qrCardHeight: number;
  sitePassword: string;
  mapUrl: string;
  homeBannerStyle: 'hero' | 'strip';
}
```

And `defaultSite`:

```ts
const defaultSite: SiteSettings = {
  coupleName1: 'Partner One',
  coupleName2: 'Partner Two',
  weddingDate: '',
  weddingTime: '',
  venueName: '',
  venueAddress: '',
  registryLinks: [],
  rsvpDeadline: '',
  rsvpCloseAfterDeadline: false,
  qrCardWidth: 2,
  qrCardHeight: 4,
  sitePassword: '',
  mapUrl: '',
  homeBannerStyle: 'strip',
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in pages that destructure `SiteSettings` without the new field. Those should update automatically if they spread, or fail if they enumerate. Expected failure location: `src/app/admin/(authenticated)/settings/page.tsx` (local `SiteSettings` interface duplicates the server one).

- [ ] **Step 3: Update the duplicate `SiteSettings` interface in settings page**

In `src/app/admin/(authenticated)/settings/page.tsx`, find the local `interface SiteSettings` and add `homeBannerStyle: 'hero' | 'strip';` to it. Also update the initial `useState` to include `homeBannerStyle: 'strip'`.

- [ ] **Step 4: Re-typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/app/admin/\(authenticated\)/settings/page.tsx
git commit -m "Add homeBannerStyle to site settings (default strip)"
```

### Task 3.2: Add banner controls to admin settings page

**Files:**
- Modify: `src/app/admin/(authenticated)/settings/page.tsx`

- [ ] **Step 1: Add the Home Banner card**

Insert a new `<Card>` block in the admin settings page, positioned above the RSVP Settings card. Use radio inputs with inline SVG previews — no binary image assets required.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Home Banner</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <p className="text-sm text-gray-500">
      Upload banner photos under <strong>Photos</strong> with <em>Gallery Section</em> set to <code className="bg-gray-100 px-1 rounded">home-banner</code>. They&apos;ll cross-fade on the home page.
    </p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${settings.homeBannerStyle === 'strip' ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}>
        <div className="flex items-center gap-2">
          <input
            type="radio"
            name="homeBannerStyle"
            value="strip"
            checked={settings.homeBannerStyle === 'strip'}
            onChange={() => update('homeBannerStyle', 'strip')}
            className="h-4 w-4"
          />
          <span className="font-medium">Strip above text</span>
        </div>
        <svg viewBox="0 0 200 120" className="w-full" role="img" aria-label="Strip layout preview">
          <rect x="0" y="0" width="200" height="120" fill="#f9fafb" />
          <rect x="10" y="10" width="180" height="40" fill="#d1d5db" />
          <text x="100" y="75" textAnchor="middle" fontSize="10" fill="#374151">We&apos;re Getting Married</text>
          <text x="100" y="92" textAnchor="middle" fontSize="8" fill="#6b7280">[ RSVP Now ]</text>
        </svg>
        <p className="text-xs text-gray-500">Photos sit above the hero text in their own block.</p>
      </label>

      <label className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${settings.homeBannerStyle === 'hero' ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}>
        <div className="flex items-center gap-2">
          <input
            type="radio"
            name="homeBannerStyle"
            value="hero"
            checked={settings.homeBannerStyle === 'hero'}
            onChange={() => update('homeBannerStyle', 'hero')}
            className="h-4 w-4"
          />
          <span className="font-medium">Photo behind text</span>
        </div>
        <svg viewBox="0 0 200 120" className="w-full" role="img" aria-label="Hero layout preview">
          <rect x="0" y="0" width="200" height="120" fill="#d1d5db" />
          <rect x="0" y="0" width="200" height="120" fill="#000" opacity="0.3" />
          <text x="100" y="55" textAnchor="middle" fontSize="10" fill="#fff">We&apos;re Getting Married</text>
          <text x="100" y="75" textAnchor="middle" fontSize="8" fill="#fff">[ RSVP Now ]</text>
        </svg>
        <p className="text-xs text-gray-500">Photos fill the hero with text overlaid on top.</p>
      </label>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Visit `/admin/settings`, confirm the Home Banner card appears, click both radios, save, reload, confirm the saved choice persists.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/\(authenticated\)/settings/page.tsx
git commit -m "Add Home Banner style selector to admin settings"
```

### Task 3.3: Create `HomeBanner` component

**Files:**
- Create: `src/components/public/HomeBanner.tsx`

- [ ] **Step 1: Create the component**

Create `/Users/ajthom90/projects/joe-and-alex/src/components/public/HomeBanner.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

type BannerPhoto = { id: string; url: string; caption: string | null };

interface Props {
  photos: BannerPhoto[];
  style: 'hero' | 'strip';
  children: React.ReactNode;
}

const ROTATE_MS = 6000;

export function HomeBanner({ photos, style, children }: Props) {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = photos.filter((p) => !hidden.has(p.id));

  const removePhoto = (id: string) => {
    setHidden((prev) => new Set(prev).add(id));
  };

  useEffect(() => {
    if (visible.length <= 1) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % visible.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [visible.length]);

  // Reset index if visible shrinks beneath it.
  useEffect(() => {
    if (index >= visible.length && visible.length > 0) setIndex(0);
  }, [index, visible.length]);

  if (visible.length === 0) {
    return <section className="py-20 md:py-32 text-center">{children}</section>;
  }

  if (style === 'hero') {
    return (
      <section className="relative overflow-hidden" style={{ minHeight: '70vh' }}>
        {visible.map((photo, i) => (
          <img
            key={photo.id}
            src={photo.url}
            alt={photo.caption || ''}
            onError={() => removePhoto(photo.id)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-center py-20 md:py-32 text-center text-white [text-shadow:_0_1px_3px_rgba(0,0,0,0.5)]">
          <div className="w-full">{children}</div>
        </div>
        {visible.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2" role="tablist" aria-label="Banner photo navigation">
            {visible.map((photo, i) => (
              <button
                key={photo.id}
                role="tab"
                aria-selected={i === index}
                aria-label={`Show photo ${i + 1} of ${visible.length}`}
                onClick={() => setIndex(i)}
                className={`h-2 w-2 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/75'}`}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  // strip style
  return (
    <>
      <section className="relative w-full overflow-hidden" style={{ height: '35vh', minHeight: '240px' }}>
        {visible.map((photo, i) => (
          <img
            key={photo.id}
            src={photo.url}
            alt={photo.caption || ''}
            onError={() => removePhoto(photo.id)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
        {visible.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2" role="tablist" aria-label="Banner photo navigation">
            {visible.map((photo, i) => (
              <button
                key={photo.id}
                role="tab"
                aria-selected={i === index}
                aria-label={`Show photo ${i + 1} of ${visible.length}`}
                onClick={() => setIndex(i)}
                className={`h-2 w-2 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/60 hover:bg-white/80'}`}
              />
            ))}
          </div>
        )}
      </section>
      <section className="py-20 md:py-32 text-center">{children}</section>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/public/HomeBanner.tsx
git commit -m "Add HomeBanner component with hero and strip styles"
```

### Task 3.4: Wire `HomeBanner` into the homepage

**Files:**
- Modify: `src/app/(public)/page.tsx`

- [ ] **Step 1: Replace the homepage hero**

Replace the entire contents of `/Users/ajthom90/projects/joe-and-alex/src/app/(public)/page.tsx`:

```tsx
import Link from 'next/link';
import { getSiteSettings } from '@/lib/settings';
import prisma from '@/lib/prisma';
import { formatDate, formatTime } from '@/lib/utils';
import { LiveCountdown } from '@/components/public/LiveCountdown';
import { HomeBanner } from '@/components/public/HomeBanner';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [settings, bannerPhotos] = await Promise.all([
    getSiteSettings(),
    prisma.photo.findMany({
      where: { gallerySection: 'home-banner', approved: true },
      orderBy: { order: 'asc' },
    }),
  ]);

  const coupleTitle =
    settings.coupleName1 && settings.coupleName2
      ? `${settings.coupleName1} & ${settings.coupleName2}`
      : "We're Getting Married!";

  const hero = (
    <div className="container mx-auto px-4">
      <p className="text-accent uppercase tracking-widest mb-4 font-medium">We&apos;re Getting Married!</p>
      <h1 className="text-5xl md:text-7xl font-heading font-bold text-primary mb-6">{coupleTitle}</h1>
      {settings.weddingDate && (
        <p className="text-xl md:text-2xl mb-8">
          {formatDate(settings.weddingDate)}
          {settings.weddingTime && ` at ${formatTime(settings.weddingTime)}`}
        </p>
      )}
      {settings.venueName && (
        <p className="text-lg mb-12">
          {settings.venueName}
          {settings.venueAddress && (
            <>
              <br />
              {settings.venueAddress}
            </>
          )}
        </p>
      )}
      <Link
        href="/rsvp"
        className="inline-block bg-primary text-white px-8 py-4 rounded-md text-lg font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        RSVP Now
      </Link>
    </div>
  );

  return (
    <div>
      <HomeBanner
        photos={bannerPhotos.map((p) => ({ id: p.id, url: p.url, caption: p.caption }))}
        style={settings.homeBannerStyle}
      >
        {hero}
      </HomeBanner>
      {settings.weddingDate && (
        <section className="py-16 bg-secondary/20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-heading mb-8">Counting Down</h2>
            <LiveCountdown weddingDate={settings.weddingDate} weddingTime={settings.weddingTime || undefined} />
          </div>
        </section>
      )}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { href: '/details', title: 'Event Details', description: 'Schedule, ceremony, and reception information' },
              { href: '/travel', title: 'Travel & Stay', description: 'Accommodations and travel tips' },
              { href: '/registry', title: 'Registry', description: 'Gift registries and well-wishes' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block p-6 border border-foreground/10 rounded-lg hover:border-primary/30 hover:shadow-md transition-all text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <h3 className="text-xl font-heading font-semibold mb-2">{link.title}</h3>
                <p className="text-foreground/70 text-sm">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
```

Note: `<HomeBanner>` is a client component accepting server-rendered `children`. That's the standard Next.js pattern — server-rendered JSX is serialized into the RSC payload and the client component receives it as a prop.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify: empty banner (default state)**

With no photos in `home-banner` section, visit `/`. Expected: homepage looks identical to before (no banner).

- [ ] **Step 4: Manually verify: strip style with photos**

In `/admin/photos`, upload 3-4 photos each with `Gallery Section = home-banner`. Visit `/`. Expected: photo strip appears above the hero text, auto-rotates every 6s, pagination dots at the bottom.

- [ ] **Step 5: Manually verify: hero style**

In `/admin/settings`, switch Home Banner style to "Photo behind text", save. Reload `/`. Expected: photos fill the hero area with the text overlaid.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(public\)/page.tsx
git commit -m "Wire HomeBanner into the homepage"
```

---

## Phase 4 — Rich Text Editor

Replace plain `<Textarea>` fields for long-form content with a Tiptap-based WYSIWYG editor that supports image upload, and render the stored HTML on public pages via a sanitized `RichContent` component.

### Task 4.1: Install Tiptap + DOMPurify

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

Run: `npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link isomorphic-dompurify`
Expected: all packages added; no errors.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add Tiptap and DOMPurify dependencies"
```

### Task 4.2: Write `renderContent` with tests (TDD)

The public side renders stored HTML through a single function that (a) detects legacy plain-text content and converts it to HTML, and (b) sanitizes the result. We test both behaviors here.

**Files:**
- Create: `src/lib/renderContent.test.ts`
- Create: `src/lib/renderContent.ts`

- [ ] **Step 1: Write the failing tests**

Create `/Users/ajthom90/projects/joe-and-alex/src/lib/renderContent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderContent } from './renderContent';

describe('renderContent', () => {
  it('returns empty string for empty input', () => {
    expect(renderContent('')).toBe('');
    expect(renderContent(undefined)).toBe('');
    expect(renderContent(null)).toBe('');
  });

  it('wraps plain text in paragraph tags', () => {
    expect(renderContent('Hello world.')).toBe('<p>Hello world.</p>');
  });

  it('splits double newlines into paragraphs', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    expect(renderContent(input)).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });

  it('converts single newlines to <br>', () => {
    const input = 'Line one\nLine two';
    expect(renderContent(input)).toBe('<p>Line one<br>Line two</p>');
  });

  it('HTML-escapes plain-text characters', () => {
    const input = 'A & B <script>alert(1)</script>';
    const out = renderContent(input);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&amp;');
    expect(out).toContain('&lt;script&gt;');
  });

  it('passes through already-HTML content (starts with <)', () => {
    const input = '<p>Already <strong>HTML</strong>.</p>';
    expect(renderContent(input)).toBe('<p>Already <strong>HTML</strong>.</p>');
  });

  it('sanitizes HTML content (strips script tags)', () => {
    const input = '<p>Safe</p><script>alert(1)</script>';
    const out = renderContent(input);
    expect(out).toContain('<p>Safe</p>');
    expect(out).not.toContain('<script>');
  });

  it('sanitizes dangerous attributes', () => {
    const input = '<p onclick="alert(1)">Click</p>';
    expect(renderContent(input)).not.toContain('onclick');
  });

  it('strips javascript: URLs on links', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    expect(renderContent(input)).not.toContain('javascript:');
  });

  it('allows images, links, headings, lists', () => {
    const input = '<h2>Head</h2><p><a href="https://example.com">link</a></p><ul><li>a</li></ul><img src="/uploads/x.jpg" alt="x">';
    const out = renderContent(input);
    expect(out).toContain('<h2');
    expect(out).toContain('<a ');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('<ul');
    expect(out).toContain('<li');
    expect(out).toContain('<img');
    expect(out).toContain('src="/uploads/x.jpg"');
  });
});
```

- [ ] **Step 2: Run the tests — expect failures**

Run: `npm test -- renderContent`
Expected: all tests fail with "Cannot find module './renderContent'".

- [ ] **Step 3: Implement `renderContent`**

Create `/Users/ajthom90/projects/joe-and-alex/src/lib/renderContent.ts`:

```ts
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'blockquote',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt'];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToHtml(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map((p) => {
      const escaped = escapeHtml(p);
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<p>${withBreaks}</p>`;
    })
    .join('');
}

export function renderContent(input: string | null | undefined): string {
  if (!input) return '';

  const trimmed = input.trim();
  if (!trimmed) return '';

  // Legacy plain-text content doesn't start with an HTML tag.
  const isHtml = trimmed.startsWith('<');
  const html = isHtml ? trimmed : plainTextToHtml(trimmed);

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block inline style (cheapest XSS vector).
    FORBID_ATTR: ['style'],
  });
}
```

- [ ] **Step 4: Run the tests — expect pass**

Run: `npm test -- renderContent`
Expected: all 10 tests pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/renderContent.ts src/lib/renderContent.test.ts
git commit -m "Add renderContent utility (plain-text migration + sanitize)"
```

### Task 4.3: Create `RichContent` component

**Files:**
- Create: `src/components/public/RichContent.tsx`

- [ ] **Step 1: Create the component**

Create `/Users/ajthom90/projects/joe-and-alex/src/components/public/RichContent.tsx`:

```tsx
import { renderContent } from '@/lib/renderContent';

interface Props {
  html: string | null | undefined;
  className?: string;
}

// This component renders HTML that has already been sanitized by renderContent()
// (which runs DOMPurify against a strict allowlist). The React prop used below
// is the standard React mechanism for injecting an HTML string into the DOM —
// its safety is enforced by renderContent's sanitization, not by React.
export function RichContent({ html, className }: Props) {
  const sanitized = renderContent(html);
  if (!sanitized) return null;
  const innerHtmlProp = { __html: sanitized };
  return (
    <div
      className={className ?? 'rich-content'}
      dangerouslySetInnerHTML={innerHtmlProp}
    />
  );
}
```

- [ ] **Step 2: Add typography styles to global CSS**

In `src/app/globals.css`, append these rules so rendered rich content has reasonable defaults:

```css
.rich-content > * + * { margin-top: 1rem; }
.rich-content p { line-height: 1.7; }
.rich-content h2 { font-family: var(--font-heading, serif); font-size: 1.5rem; margin-top: 2rem; margin-bottom: 0.75rem; }
.rich-content h3 { font-family: var(--font-heading, serif); font-size: 1.25rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }
.rich-content ul { list-style: disc; padding-left: 1.5rem; }
.rich-content ol { list-style: decimal; padding-left: 1.5rem; }
.rich-content li { margin-bottom: 0.25rem; }
.rich-content a { color: rgb(var(--color-primary, 139 90 43)); text-decoration: underline; }
.rich-content blockquote { border-left: 4px solid rgb(var(--color-foreground, 55 48 42) / 0.2); padding-left: 1rem; font-style: italic; }
.rich-content img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1.5rem auto; display: block; }
```

Tip: `ThemeStyle` injects theme colors as CSS variables (`--color-primary`, etc.). If those variables aren't already defined globally, the `var(..., fallback)` above keeps things working.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/public/RichContent.tsx src/app/globals.css
git commit -m "Add RichContent component with typography styles"
```

### Task 4.4: Create `RichTextEditor` component

**Files:**
- Create: `src/components/admin/RichTextEditor.tsx`

- [ ] **Step 1: Create the component**

Create `/Users/ajthom90/projects/joe-and-alex/src/components/admin/RichTextEditor.tsx`:

```tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = '200px' }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ HTMLAttributes: { class: 'rounded-md my-4' } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        // Styling is handled by the .ProseMirror global styles below.
        // (We don't rely on @tailwindcss/typography's `prose` class — not installed.)
        class: 'focus:outline-none',
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Keep editor in sync when value changes externally (e.g., tab switch).
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        alert(err.error || 'Upload failed');
        return;
      }
      const data = await res.json();
      editor?.chain().focus().setImage({ src: data.url, alt: '' }).run();
    } finally {
      setUploading(false);
    }
  };

  const addLink = () => {
    const current = editor?.getAttributes('link').href as string | undefined;
    const url = prompt('Enter URL:', current ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor?.chain().focus().unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  if (!editor) return null;

  const Btn = ({ active, onClick, label, disabled }: { active?: boolean; onClick: () => void; label: string; disabled?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-sm rounded transition-colors ${active ? 'bg-gray-200' : 'hover:bg-gray-100'} disabled:opacity-40`}
    >
      {label}
    </button>
  );

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="B" />
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" />
        <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="H2" />
        <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} label="H3" />
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="• List" />
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1. List" />
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="❝" />
        <Btn active={editor.isActive('link')} onClick={addLink} label="Link" />
        <Btn
          onClick={() => fileInputRef.current?.click()}
          label={uploading ? 'Uploading…' : '🖼 Image'}
          disabled={uploading}
        />
        <div className="ml-auto flex gap-1">
          <Btn onClick={() => editor.chain().focus().undo().run()} label="↶" disabled={!editor.can().undo()} />
          <Btn onClick={() => editor.chain().focus().redo().run()} label="↷" disabled={!editor.can().redo()} />
        </div>
      </div>
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
          e.target.value = '';
        }}
      />
      <style jsx global>{`
        .ProseMirror { outline: none; padding: 0.5rem 0.75rem; }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror img { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
        .ProseMirror h2 { font-size: 1.5rem; font-weight: 600; margin: 1rem 0 0.5rem; }
        .ProseMirror h3 { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
        .ProseMirror ul { list-style: disc; padding-left: 1.5rem; }
        .ProseMirror ol { list-style: decimal; padding-left: 1.5rem; }
        .ProseMirror blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; font-style: italic; }
        .ProseMirror a { color: #2563eb; text-decoration: underline; }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/RichTextEditor.tsx
git commit -m "Add Tiptap-based RichTextEditor component"
```

### Task 4.5: Swap Textarea for RichTextEditor in the Content admin page

**Files:**
- Modify: `src/app/admin/(authenticated)/content/page.tsx`

- [ ] **Step 1: Import RichTextEditor**

At the top of `src/app/admin/(authenticated)/content/page.tsx`, add:

```tsx
import { RichTextEditor } from '@/components/admin/RichTextEditor';
```

- [ ] **Step 2: Replace the Our Story textarea**

Find the block `{activeTab === 'our-story' && (` and replace the `<Textarea>` inside it with `<RichTextEditor>`:

```tsx
{activeTab === 'our-story' && (
  <div>
    <label className="block text-sm font-medium mb-1">Story Text</label>
    <RichTextEditor
      value={story}
      onChange={setStoryText}
      placeholder="Tell your love story…"
      minHeight="300px"
    />
  </div>
)}
```

- [ ] **Step 3: Replace the Details schedule textarea**

Find `{activeTab === 'details' && (` and replace the schedule Textarea (leave Dress Code as an `<Input>`):

```tsx
{activeTab === 'details' && (
  <>
    <div>
      <label className="block text-sm font-medium mb-1">Schedule</label>
      <RichTextEditor
        value={schedule}
        onChange={setSchedule}
        placeholder="Ceremony at 4:00 PM, Reception to follow…"
        minHeight="200px"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1">Dress Code</label>
      <Input
        value={dressCode}
        onChange={(e) => setDressCode(e.target.value)}
        placeholder="e.g., Formal, Semi-Formal, Cocktail"
      />
    </div>
  </>
)}
```

- [ ] **Step 4: Replace the Travel travelInfo textarea**

Find the "Travel Information" block and replace its `<Textarea>`:

```tsx
<div>
  <label className="block text-sm font-medium mb-1">Travel Information</label>
  <RichTextEditor
    value={travelInfo}
    onChange={setTravelInfo}
    placeholder="Information about getting to the venue…"
    minHeight="150px"
  />
</div>
```

Leave the Hotels section alone — hotel fields are short and shouldn't use rich text.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manually verify**

Visit `/admin/content`. For each tab (Our Story, Details, Travel), type text, format something (bold, heading), click the 🖼 Image button to upload a JPEG, and save. Reload and confirm the content persists. Expect the admin tabs to show a toolbar above each editor now.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/\(authenticated\)/content/page.tsx
git commit -m "Use RichTextEditor for content admin long-form fields"
```

### Task 4.6: Swap Textarea for RichTextEditor in the Events admin page

**Files:**
- Modify: `src/app/admin/(authenticated)/events/page.tsx`

- [ ] **Step 1: Import RichTextEditor**

Add to the top of the file:

```tsx
import { RichTextEditor } from '@/components/admin/RichTextEditor';
```

- [ ] **Step 2: Replace the Description textarea**

Find the `<Textarea>` with label "Description" (near the bottom of the modal, around line 281) and replace the full `<div>` with:

```tsx
<div>
  <label className="block text-sm font-medium mb-1">Description</label>
  <RichTextEditor
    value={form.description}
    onChange={(html) => updateForm('description', html)}
    placeholder="Event description"
    minHeight="150px"
  />
</div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Visit `/admin/events`, click Edit on an event, confirm the description now uses the rich editor.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/\(authenticated\)/events/page.tsx
git commit -m "Use RichTextEditor for event descriptions"
```

### Task 4.7: Render RichContent on public pages

**Files:**
- Modify: `src/app/(public)/our-story/page.tsx`
- Modify: `src/app/(public)/details/page.tsx`
- Modify: `src/app/(public)/travel/page.tsx`
- Modify: `src/app/(public)/events/page.tsx`

- [ ] **Step 1: Update Our Story page**

Replace the entire contents of `/Users/ajthom90/projects/joe-and-alex/src/app/(public)/our-story/page.tsx`:

```tsx
import prisma from '@/lib/prisma';
import { RichContent } from '@/components/public/RichContent';

export const dynamic = 'force-dynamic';

export default async function OurStoryPage() {
  const page = await prisma.page.findUnique({ where: { slug: 'our-story' } });
  let content: any = null;
  if (page?.content) {
    try { content = JSON.parse(page.content); } catch { content = null; }
  }
  const photos = await prisma.photo.findMany({
    where: { gallerySection: 'us' },
    orderBy: { order: 'asc' },
  });

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Our Story</h1>
      <div className="max-w-3xl mx-auto">
        {content?.story ? (
          <RichContent html={content.story} className="rich-content text-foreground/80 mb-12" />
        ) : (
          <p className="text-center text-foreground/60 mb-12">Our story coming soon!</p>
        )}
        {photos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {photos.map((photo) => (
              <div key={photo.id} className="rounded-lg overflow-hidden">
                <img src={photo.url} alt={photo.caption || ''} className="w-full h-64 object-cover" />
                {photo.caption && <p className="text-sm text-foreground/60 mt-2 text-center">{photo.caption}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update Details page**

In `/Users/ajthom90/projects/joe-and-alex/src/app/(public)/details/page.tsx`, add the import:

```tsx
import { RichContent } from '@/components/public/RichContent';
```

Find the schedule block:

```tsx
{content?.schedule && (
  <section className="text-center">
    <h2 className="text-2xl font-heading font-semibold mb-4">Schedule</h2>
    <div className="text-foreground/80 whitespace-pre-line">{content.schedule}</div>
  </section>
)}
```

Replace the inner div:

```tsx
{content?.schedule && (
  <section className="text-center">
    <h2 className="text-2xl font-heading font-semibold mb-4">Schedule</h2>
    <RichContent html={content.schedule} className="rich-content text-foreground/80 text-left max-w-xl mx-auto" />
  </section>
)}
```

- [ ] **Step 3: Update Travel page**

Replace `/Users/ajthom90/projects/joe-and-alex/src/app/(public)/travel/page.tsx`:

```tsx
import prisma from '@/lib/prisma';
import { RichContent } from '@/components/public/RichContent';

export const dynamic = 'force-dynamic';

export default async function TravelPage() {
  const page = await prisma.page.findUnique({ where: { slug: 'travel' } });
  let content: any = null;
  if (page?.content) {
    try { content = JSON.parse(page.content); } catch { content = null; }
  }
  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Travel & Accommodations</h1>
      <div className="max-w-3xl mx-auto space-y-12">
        {content?.travelInfo && (
          <section>
            <RichContent html={content.travelInfo} className="rich-content text-foreground/80" />
          </section>
        )}
        {content?.hotels && content.hotels.length > 0 && (
          <section>
            <h2 className="text-2xl font-heading font-semibold text-center mb-8">Where to Stay</h2>
            <div className="grid gap-6">
              {content.hotels.map((hotel: any, i: number) => (
                <div key={i} className="border border-foreground/10 rounded-lg p-6">
                  <h3 className="text-xl font-heading font-semibold mb-2">{hotel.name}</h3>
                  {hotel.address && <p className="text-foreground/70 mb-2">{hotel.address}</p>}
                  {hotel.phone && <p className="text-foreground/70 mb-2">Phone: {hotel.phone}</p>}
                  {hotel.notes && <p className="text-foreground/70 mb-2">{hotel.notes}</p>}
                  {hotel.url && (
                    <a href={hotel.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Book Now
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {!content && (
          <div className="text-center text-foreground/60 py-8">
            <p>Travel information coming soon!</p>
            <p className="text-sm mt-2">Check back later for accommodation details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update Events page description rendering**

In `/Users/ajthom90/projects/joe-and-alex/src/app/(public)/events/page.tsx` (now a server component from Task 2.4), add the import:

```tsx
import { RichContent } from '@/components/public/RichContent';
```

Find:

```tsx
{event.description && (
  <p className="text-foreground/70 leading-relaxed whitespace-pre-line">{event.description}</p>
)}
```

Replace with:

```tsx
{event.description && (
  <RichContent html={event.description} className="rich-content text-foreground/70 leading-relaxed" />
)}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manually verify: existing plain-text content still renders**

With no changes to the database, visit `/our-story`, `/details`, `/travel`, `/events`. Existing plain-text content should render as paragraphs with single-newline line breaks, matching the old `whitespace-pre-line` behavior.

- [ ] **Step 7: Manually verify: new rich content renders with inline images**

Go to `/admin/content`, Our Story tab. Replace the story with some text, insert an image via the 🖼 button, use bold/heading formatting, save. Visit `/our-story` — confirm the image appears inline, formatting renders, no raw HTML visible.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(public\)/our-story/page.tsx src/app/\(public\)/details/page.tsx src/app/\(public\)/travel/page.tsx src/app/\(public\)/events/page.tsx
git commit -m "Render content fields with RichContent on public pages"
```

---

## Final Verification

After all phases complete, run these final checks before handing off:

- [ ] **Full test run**

Run: `npm test`
Expected: all tests (mapUrl + renderContent) pass. 19 tests total.

- [ ] **Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Build smoke test**

Run: `npm run build`
Expected: Next.js build succeeds, no prerender errors.

- [ ] **End-to-end smoke test in the browser**

With the dev server running and logged into admin:

1. `/admin/photos` — upload an iPhone HEIC file. Confirm it lands with a `.jpg` URL. Upload a 12 MB file — confirm rejected with "Maximum size is 10MB".
2. `/admin/settings` — switch between "Strip" and "Hero" banner styles. Add a Google Maps short URL (`maps.app.goo.gl/...`) to the Map field.
3. `/admin/photos` — upload 3 photos with Gallery Section = `home-banner`.
4. `/admin/content` — edit Our Story: format some text, insert an image. Save.
5. `/admin/events` — edit an event: add a maps.app.goo.gl URL and a rich description with an image. Save.
6. `/` — confirm banner renders in the selected style, cycles through photos.
7. `/our-story` — confirm rich content renders with inline image.
8. `/details` — confirm venue map renders from the short URL.
9. `/events` — confirm event map renders and description shows image.

- [ ] **Docker build sanity check** (optional, if deploying)

The Dockerfile already uses `npm ci`; new deps flow through automatically. Confirm no native build steps are needed for `heic-convert` / `@tiptap/*` / `isomorphic-dompurify` by running:

```bash
docker build -t joe-and-alex:test .
```

Expected: build succeeds without native-binding errors.
