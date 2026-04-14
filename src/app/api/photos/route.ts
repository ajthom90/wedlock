import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const photos = await prisma.photo.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(photos);
  } catch (error) {
    console.error('Error fetching photos:', error);
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { url, caption, gallerySection, focalX, focalY, zoom } = body;
    const maxOrder = await prisma.photo.aggregate({ _max: { order: true } });

    const data: {
      url: string;
      caption: string | null;
      gallerySection: string | null;
      order: number;
      focalX?: number;
      focalY?: number;
      zoom?: number;
    } = {
      url,
      caption: caption || null,
      gallerySection: gallerySection || null,
      order: (maxOrder._max.order || 0) + 1,
    };
    if (typeof focalX === 'number') data.focalX = Math.max(0, Math.min(100, Math.round(focalX)));
    if (typeof focalY === 'number') data.focalY = Math.max(0, Math.min(100, Math.round(focalY)));
    if (typeof zoom === 'number') data.zoom = Math.max(1, Math.min(3, zoom));

    const photo = await prisma.photo.create({ data });
    return NextResponse.json(photo);
  } catch (error) {
    console.error('Error creating photo:', error);
    return NextResponse.json({ error: 'Failed to create photo' }, { status: 500 });
  }
}
