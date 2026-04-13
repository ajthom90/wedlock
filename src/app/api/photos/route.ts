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
    const { url, caption, gallerySection } = await request.json();
    const maxOrder = await prisma.photo.aggregate({ _max: { order: true } });
    const photo = await prisma.photo.create({ data: { url, caption: caption || null, gallerySection: gallerySection || null, order: (maxOrder._max.order || 0) + 1 } });
    return NextResponse.json(photo);
  } catch (error) {
    console.error('Error creating photo:', error);
    return NextResponse.json({ error: 'Failed to create photo' }, { status: 500 });
  }
}
