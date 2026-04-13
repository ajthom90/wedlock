import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const options = await prisma.rsvpOption.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(options);
  } catch (error) {
    console.error('Error fetching RSVP options:', error);
    return NextResponse.json({ error: 'Failed to fetch RSVP options' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { type, label, choices, required } = await request.json();
    const maxOrder = await prisma.rsvpOption.aggregate({ _max: { order: true } });
    const option = await prisma.rsvpOption.create({ data: { type, label, choices: JSON.stringify(choices), required: required || false, order: (maxOrder._max.order || 0) + 1 } });
    return NextResponse.json(option);
  } catch (error) {
    console.error('Error creating RSVP option:', error);
    return NextResponse.json({ error: 'Failed to create RSVP option' }, { status: 500 });
  }
}
