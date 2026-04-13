import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { label, visible, order } = await request.json();
    const item = await prisma.navItem.update({
      where: { id },
      data: { label, visible, order },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating nav item:', error);
    return NextResponse.json({ error: 'Failed to update nav item' }, { status: 500 });
  }
}
