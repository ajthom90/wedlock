import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const items = await prisma.faqItem.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching FAQ items:', error);
    return NextResponse.json({ error: 'Failed to fetch FAQ items' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { question, answer } = await request.json();
    const maxOrder = await prisma.faqItem.aggregate({ _max: { order: true } });
    const item = await prisma.faqItem.create({ data: { question, answer, order: (maxOrder._max.order || 0) + 1 } });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error creating FAQ item:', error);
    return NextResponse.json({ error: 'Failed to create FAQ item' }, { status: 500 });
  }
}
