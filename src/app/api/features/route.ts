import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getFeatures, saveFeatures } from '@/lib/settings';

export async function GET() {
  try {
    const features = await getFeatures();
    return NextResponse.json(features);
  } catch (error) {
    console.error('Error fetching features:', error);
    return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    await saveFeatures(body);
    const features = await getFeatures();
    return NextResponse.json(features);
  } catch (error) {
    console.error('Error saving features:', error);
    return NextResponse.json({ error: 'Failed to save features' }, { status: 500 });
  }
}
