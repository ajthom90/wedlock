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
