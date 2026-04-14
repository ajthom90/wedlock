import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

// PUT accepts partial updates. Only fields explicitly present in the body are updated.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: {
      url?: string;
      caption?: string | null;
      gallerySection?: string | null;
      order?: number;
      focalX?: number;
      focalY?: number;
      zoom?: number;
    } = {};
    if ('url' in body) data.url = body.url;
    if ('caption' in body) data.caption = body.caption?.trim() || null;
    if ('gallerySection' in body) {
      const v = typeof body.gallerySection === 'string' ? body.gallerySection.trim() : '';
      data.gallerySection = v ? v : null;
    }
    if ('order' in body && typeof body.order === 'number') data.order = body.order;
    if ('focalX' in body && typeof body.focalX === 'number') {
      data.focalX = Math.max(0, Math.min(100, Math.round(body.focalX)));
    }
    if ('focalY' in body && typeof body.focalY === 'number') {
      data.focalY = Math.max(0, Math.min(100, Math.round(body.focalY)));
    }
    if ('zoom' in body && typeof body.zoom === 'number') {
      data.zoom = Math.max(1, Math.min(3, body.zoom));
    }

    const photo = await prisma.photo.update({ where: { id }, data });
    return NextResponse.json(photo);
  } catch (error) {
    console.error('Error updating photo:', error);
    return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.photo.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 });
  }
}
