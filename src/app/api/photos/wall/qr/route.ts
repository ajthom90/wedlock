import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { generateQRCode } from '@/lib/qr';

// Generates a big QR code that deep-links to the wall upload page.
// Rendered on the admin Photo Wall page so the couple can print or cast it.
export async function GET(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const origin = new URL(request.url).origin;
    const uploadUrl = `${origin}/wall/upload`;
    const qrCode = await generateQRCode(uploadUrl, { width: 800 });
    return NextResponse.json({ qrCode, uploadUrl });
  } catch (error) {
    console.error('Error generating wall QR:', error);
    return NextResponse.json({ error: 'Failed to generate QR' }, { status: 500 });
  }
}
