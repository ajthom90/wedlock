import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('date' in body) data.date = body.date?.trim();
    if ('title' in body) data.title = body.title?.trim();
    if ('description' in body) data.description = body.description?.trim() || null;
    if ('imageUrl' in body) data.imageUrl = body.imageUrl || null;
    if ('order' in body && typeof body.order === 'number') data.order = body.order;
    if ('focalX' in body && typeof body.focalX === 'number') data.focalX = Math.max(0, Math.min(100, Math.round(body.focalX)));
    if ('focalY' in body && typeof body.focalY === 'number') data.focalY = Math.max(0, Math.min(100, Math.round(body.focalY)));
    if ('zoom' in body && typeof body.zoom === 'number') data.zoom = Math.max(1, Math.min(3, body.zoom));

    const item = await prisma.storyMilestone.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating milestone:', error);
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.storyMilestone.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 });
  }
}
