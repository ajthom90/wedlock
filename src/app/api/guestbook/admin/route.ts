import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { getFeatures } from '@/lib/settings';

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const features = await getFeatures();
    const entries = await prisma.guestBookEntry.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ entries, mode: features.guestBook });
  } catch (error) {
    console.error('Error fetching guest book entries:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}
