import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

// Batch reorder: accepts an array of { id, order } and updates each photo's order
// in a single transaction. Used by the Home Banner and Media Manager admin pages.
export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (!Array.isArray(body?.updates)) {
      return NextResponse.json({ error: 'Body must include an `updates` array' }, { status: 400 });
    }

    const updates: Array<{ id: string; order: number }> = body.updates.filter(
      (u: unknown): u is { id: string; order: number } =>
        typeof u === 'object' && u !== null && typeof (u as { id?: unknown }).id === 'string' && typeof (u as { order?: unknown }).order === 'number',
    );

    if (updates.length === 0) return NextResponse.json({ success: true, updated: 0 });

    await prisma.$transaction(
      updates.map((u) => prisma.photo.update({ where: { id: u.id }, data: { order: u.order } })),
    );

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error('Error reordering photos:', error);
    return NextResponse.json({ error: 'Failed to reorder photos' }, { status: 500 });
  }
}
