import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('name' in body) data.name = body.name?.trim();
    if ('description' in body) data.description = body.description?.trim() || null;
    if ('goalAmount' in body && typeof body.goalAmount === 'number') data.goalAmount = Math.max(0, body.goalAmount);
    if ('imageUrl' in body) data.imageUrl = body.imageUrl || null;
    if ('order' in body && typeof body.order === 'number') data.order = body.order;

    const item = await prisma.honeymoonItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating honeymoon item:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.honeymoonItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting honeymoon item:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
