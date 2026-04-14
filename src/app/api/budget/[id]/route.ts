import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: {
      category?: string;
      description?: string;
      estimated?: number;
      actual?: number;
      paid?: boolean;
      notes?: string | null;
      order?: number;
    } = {};
    if ('category' in body) data.category = body.category?.trim();
    if ('description' in body) data.description = body.description?.trim();
    if ('estimated' in body && typeof body.estimated === 'number') data.estimated = body.estimated;
    if ('actual' in body && typeof body.actual === 'number') data.actual = body.actual;
    if ('paid' in body) data.paid = !!body.paid;
    if ('notes' in body) data.notes = body.notes?.trim() || null;
    if ('order' in body && typeof body.order === 'number') data.order = body.order;

    const item = await prisma.budgetItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating budget item:', error);
    return NextResponse.json({ error: 'Failed to update budget item' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.budgetItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting budget item:', error);
    return NextResponse.json({ error: 'Failed to delete budget item' }, { status: 500 });
  }
}
