import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPdfFont, _resetPdfFontCacheForTests } from './pdfFonts';

const FAKE_TTF = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x99]);

function mockGoogleFetch() {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.startsWith('https://fonts.googleapis.com/css2')) {
      return {
        ok: true,
        text: async () => `@font-face {\n  font-family: 'Lato';\n  src: url(https://fonts.gstatic.com/s/lato/fake.ttf) format('truetype');\n}\n`,
      } as unknown as Response;
    }
    if (u === 'https://fonts.gstatic.com/s/lato/fake.ttf') {
      return { ok: true, arrayBuffer: async () => FAKE_TTF.buffer } as unknown as Response;
    }
    return { ok: false, statusText: 'not found' } as unknown as Response;
  });
}

beforeEach(() => {
  _resetPdfFontCacheForTests();
});

describe('loadPdfFont', () => {
  it('fetches a Google font at the requested weight', async () => {
    const fetchMock = mockGoogleFetch();
    vi.stubGlobal('fetch', fetchMock);
    const bytes = await loadPdfFont('Lato', 700, []);
    expect(new Uint8Array(bytes)).toEqual(FAKE_TTF);
    const cssCall = String(fetchMock.mock.calls[0][0]);
    expect(cssCall).toContain('family=Lato');
    expect(cssCall).toContain('wght@700');
    vi.unstubAllGlobals();
  });

  it('caches per family and weight', async () => {
    const fetchMock = mockGoogleFetch();
    vi.stubGlobal('fetch', fetchMock);
    await loadPdfFont('Lato', 400, []);
    await loadPdfFont('Lato', 400, []);
    // 2 calls for the first load (css + font file), none for the second.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await loadPdfFont('Lato', 700, []);
    // Different weight is a separate cache entry.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.unstubAllGlobals();
  });

  it('falls back to Lato for unknown families', async () => {
    const fetchMock = mockGoogleFetch();
    vi.stubGlobal('fetch', fetchMock);
    const bytes = await loadPdfFont('Definitely Not A Font', 400, []);
    expect(new Uint8Array(bytes)).toEqual(FAKE_TTF);
    expect(String(fetchMock.mock.calls[0][0])).toContain('family=Lato');
    vi.unstubAllGlobals();
  });

  it('throws when the css response has no font url', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'nothing here' }) as unknown as Response));
    await expect(loadPdfFont('Lato', 400, [])).rejects.toThrow(/font URL/i);
    vi.unstubAllGlobals();
  });
});
