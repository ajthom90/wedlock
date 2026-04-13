import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateQRCode, buildRsvpUrl } from '@/lib/qr';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invitation = await prisma.invitation.findUnique({ where: { id } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${proto}://${host}`;
    const rsvpUrl = buildRsvpUrl(baseUrl, invitation.code);
    const qrCode = await generateQRCode(rsvpUrl);
    return NextResponse.json({ qrCode, rsvpUrl, code: invitation.code });
  } catch (error) {
    console.error('Error generating QR code:', error);
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 });
  }
}
