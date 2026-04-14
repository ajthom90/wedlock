import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const items = await prisma.storyMilestone.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching milestones:', error);
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { date, title, description, imageUrl, focalX, focalY, zoom } = await request.json();
    if (!date?.trim() || !title?.trim()) {
      return NextResponse.json({ error: 'Date and title are required' }, { status: 400 });
    }
    const maxOrder = await prisma.storyMilestone.aggregate({ _max: { order: true } });
    const item = await prisma.storyMilestone.create({
      data: {
        date: date.trim(),
        title: title.trim(),
        description: description?.trim() || null,
        imageUrl: imageUrl || null,
        focalX: typeof focalX === 'number' ? Math.max(0, Math.min(100, Math.round(focalX))) : 50,
        focalY: typeof focalY === 'number' ? Math.max(0, Math.min(100, Math.round(focalY))) : 50,
        zoom: typeof zoom === 'number' ? Math.max(1, Math.min(3, zoom)) : 1,
        order: (maxOrder._max.order || 0) + 1,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error creating milestone:', error);
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
  }
}
