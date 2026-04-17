import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getBroadcast } from '@/lib/broadcasts';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const broadcast = await getBroadcast(id);
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(broadcast);
}
