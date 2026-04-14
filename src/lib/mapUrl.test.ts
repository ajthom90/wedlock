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
