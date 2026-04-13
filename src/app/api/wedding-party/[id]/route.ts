import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { name, role, side, description, imageUrl, order } = await request.json();
    const member = await prisma.weddingPartyMember.update({ where: { id }, data: { name, role, side, description: description || null, imageUrl: imageUrl || null, order: order || 0 } });
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
