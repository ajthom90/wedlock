import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { question, answer, order } = await request.json();
    const item = await prisma.faqItem.update({ where: { id }, data: { question, answer, order } });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating FAQ item:', error);
    return NextResponse.json({ error: 'Failed to update FAQ item' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.faqItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting FAQ item:', error);
    return NextResponse.json({ error: 'Failed to delete FAQ item' }, { status: 500 });
  }
}
