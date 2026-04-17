import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getFeatures } from '@/lib/settings';
import { listBroadcasts, sendBroadcast } from '@/lib/broadcasts';

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const features = await getFeatures();
  if (!features.dayOfBroadcasts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const broadcasts = await listBroadcasts();
  return NextResponse.json(broadcasts.map((b) => ({
    id: b.id,
    subject: b.subject,
    sentAt: b.sentAt,
    recipientCount: b.recipientCount,
    sentCount: b.deliveries.filter((d) => d.status === 'sent').length,
    failedCount: b.deliveries.filter((d) => d.status === 'failed').length,
  })));
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const features = await getFeatures();
  if (!features.dayOfBroadcasts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { subject, body } = await request.json();
  if (typeof subject !== 'string' || !subject.trim() || typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }
  const result = await sendBroadcast({ subject: subject.trim(), body: body.trim() });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
