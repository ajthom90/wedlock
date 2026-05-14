import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const corrections = await prisma.rsvpCorrection.findMany({
      orderBy: [{ handledAt: 'asc' }, { createdAt: 'desc' }],
      include: { invitation: { select: { id: true, code: true, householdName: true } } },
    });
    return NextResponse.json(corrections);
  } catch (error) {
    console.error('Error fetching corrections:', error);
    return NextResponse.json({ error: 'Failed to fetch corrections' }, { status: 500 });
  }
}
