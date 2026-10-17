import { afterEach, describe, expect, it } from 'vitest';
import { getPublicBaseUrl } from './qr';

describe('getPublicBaseUrl', () => {
  afterEach(() => {
    delete process.env.PUBLIC_SITE_URL;
  });

  it('prefers PUBLIC_SITE_URL and strips trailing slashes', () => {
    process.env.PUBLIC_SITE_URL = 'https://wedding.example.com/';
    const req = new Request('http://172.18.0.2:3000/api/photos/wall/qr', { headers: { host: '172.18.0.2:3000' } });
    expect(getPublicBaseUrl(req)).toBe('https://wedding.example.com');
  });

  it('uses forwarded host and proto from a reverse proxy', () => {
    const req = new Request('http://172.18.0.2:3000/api/photos/wall/qr', {
      headers: { host: '172.18.0.2:3000', 'x-forwarded-host': 'wedding.example.com', 'x-forwarded-proto': 'https' },
    });
    expect(getPublicBaseUrl(req)).toBe('https://wedding.example.com');
  });

  it('falls back to the Host header over the bind address', () => {
    const req = new Request('http://0.0.0.0:3000/api/photos/wall/qr', { headers: { host: 'wedding.local:8080' } });
    expect(getPublicBaseUrl(req)).toBe('http://wedding.local:8080');
  });
});
