import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Public endpoint: returns approved photos tagged for the live wall. Used by
// the /wall page to poll for new uploads every ~10s so the gallery auto-
// refreshes during the reception without a full page reload.
export async function GET() {
  try {
    const photos = await prisma.photo.findMany({
      where: { gallerySection: 'wall', approved: true },
      select: { id: true, url: true, caption: true, uploadedBy: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json(photos);
  } catch (error) {
    console.error('Error fetching wall photos:', error);
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }
}
