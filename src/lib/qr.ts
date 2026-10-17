import QRCode from 'qrcode';

const defaultOptions = {
  width: 300,
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' },
};

export async function generateQRCode(data: string, options: Partial<typeof defaultOptions> = {}): Promise<string> {
  const opts = { ...defaultOptions, ...options };
  return QRCode.toDataURL(data, { width: opts.width, margin: opts.margin, color: opts.color });
}

export function buildRsvpUrl(baseUrl: string, code: string): string {
  return `${baseUrl}/rsvp?code=${code}`;
}

// Public origin for links baked into QR codes. Prefers PUBLIC_SITE_URL (same
// env var email uses), then the proxy/Host headers. request.url alone is the
// server's bind address inside Docker, which guests' phones can't reach.
export function getPublicBaseUrl(request: Request): string {
  const configured = process.env.PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(/:$/, '');
  return `${proto}://${host}`;
}
