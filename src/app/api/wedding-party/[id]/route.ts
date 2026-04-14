import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

// PUT accepts partial updates — only fields explicitly present in the body are
// written. Focal-point fields are validated into their allowed ranges.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: {
      name?: string;
      role?: string;
      side?: string;
      description?: string | null;
      imageUrl?: string | null;
      order?: number;
      focalX?: number;
      focalY?: number;
      zoom?: number;
    } = {};
    if ('name' in body) data.name = body.name;
    if ('role' in body) data.role = body.role;
    if ('side' in body) data.side = body.side;
    if ('description' in body) data.description = body.description?.trim() || null;
    if ('imageUrl' in body) data.imageUrl = body.imageUrl || null;
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

    const member = await prisma.weddingPartyMember.update({ where: { id }, data });
    return NextResponse.json(member);
  } catch (error) {
    console.error('Error updating wedding party member:', error);
    return NextResponse.json({ error: 'Failed to update wedding party member' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.weddingPartyMember.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting wedding party member:', error);
    return NextResponse.json({ error: 'Failed to delete wedding party member' }, { status: 500 });
  }
}
