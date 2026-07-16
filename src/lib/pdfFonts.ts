// Server-side loading of theme fonts as raw bytes for pdf-lib embedding.
// Custom fonts come from the /data/uploads volume; Google fonts are fetched
// at runtime per weight. The old-Chrome User-Agent matters: it makes Google
// return a single full TTF per weight instead of woff2 unicode-range subsets
// that @pdf-lib/fontkit can't reliably embed.
//
// Used by the QR invitation-card route (server-rendered PDF) and the
// /api/fonts/pdf endpoint that feeds the client-rendered label PDFs.

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const GOOGLE_FONT_MAP: Record<string, string> = {
  'Playfair Display': 'Playfair+Display', 'Cormorant Garamond': 'Cormorant+Garamond',
  'Great Vibes': 'Great+Vibes', Lato: 'Lato', 'Open Sans': 'Open+Sans',
  Roboto: 'Roboto', Merriweather: 'Merriweather', Montserrat: 'Montserrat',
};

export type FontWeight = 400 | 700;

export interface CustomFontRef {
  family: string;
  filename: string;
}

const fontCache = new Map<string, Uint8Array>();

export function _resetPdfFontCacheForTests() {
  fontCache.clear();
}

async function loadCustomFont(filename: string): Promise<Uint8Array> {
  const key = `custom:${filename}`;
  const cached = fontCache.get(key);
  if (cached) return cached;
  const filePath = path.join('/data/uploads', filename);
  if (!existsSync(filePath)) throw new Error(`Custom font file not found: ${filename}`);
  const data = new Uint8Array(await readFile(filePath));
  fontCache.set(key, data);
  return data;
}

async function loadGoogleFont(fontName: string, weight: FontWeight): Promise<Uint8Array> {
  const key = `google:${fontName}:${weight}`;
  const cached = fontCache.get(key);
  if (cached) return cached;
  const encoded = GOOGLE_FONT_MAP[fontName];
  if (!encoded) throw new Error(`Unknown Google Font: ${fontName}`);
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weight}&display=swap`;
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  if (!cssRes.ok) throw new Error(`Failed to fetch Google Font CSS: ${cssRes.statusText}`);
  const css = await cssRes.text();
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match) throw new Error(`Could not find font URL in CSS for ${fontName}`);
  const fontUrl = match[1].replace(/['"]/g, '');
  const fontRes = await fetch(fontUrl);
  if (!fontRes.ok) throw new Error(`Failed to download font file: ${fontRes.statusText}`);
  const data = new Uint8Array(await fontRes.arrayBuffer());
  fontCache.set(key, data);
  return data;
}

// Resolves a theme font family to embeddable bytes. Custom uploaded fonts win
// (a single file serves every weight — deployers upload one file per family);
// known Google families are fetched per weight; anything else falls back to
// Lato so PDF generation never depends on the theme being well-formed.
export async function loadPdfFont(family: string, weight: FontWeight, customFonts: CustomFontRef[]): Promise<Uint8Array> {
  const custom = customFonts.find((f) => f.family === family);
  if (custom) return loadCustomFont(custom.filename);
  if (family in GOOGLE_FONT_MAP) return loadGoogleFont(family, weight);
  console.warn(`Font "${family}" not found, falling back to Lato`);
  return loadGoogleFont('Lato', weight);
}
