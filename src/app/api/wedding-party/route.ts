import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const members = await prisma.weddingPartyMember.findMany({ orderBy: [{ side: 'asc' }, { order: 'asc' }] });
    return NextResponse.json(members);
  } catch (error) {
    console.error('Error fetching wedding party:', error);
    return NextResponse.json({ error: 'Failed to fetch wedding party' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, role, side, description, imageUrl } = await request.json();
    const maxOrder = await prisma.weddingPartyMember.aggregate({ where: { side }, _max: { order: true } });
    const member = await prisma.weddingPartyMember.create({ data: { name, role, side, description: description || null, imageUrl: imageUrl || null, order: (maxOrder._max.order || 0) + 1 } });
    return NextResponse.json(member);
  } catch (error) {
    console.error('Error creating wedding party member:', error);
    return NextResponse.json({ error: 'Failed to create wedding party member' }, { status: 500 });
  }
}
