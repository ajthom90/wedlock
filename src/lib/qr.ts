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
