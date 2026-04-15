import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('label' in body) data.label = body.label;
    if ('href' in body) data.href = body.href?.trim() || null;
    if ('visible' in body) data.visible = body.visible;
    if ('order' in body) data.order = body.order;
    if ('parentId' in body) data.parentId = body.parentId || null;

    const item = await prisma.navItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating nav item:', error);
    return NextResponse.json({ error: 'Failed to update nav item' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    // Cascade is wired in the schema — children auto-delete.
    await prisma.navItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting nav item:', error);
    return NextResponse.json({ error: 'Failed to delete nav item' }, { status: 500 });
  }
}
