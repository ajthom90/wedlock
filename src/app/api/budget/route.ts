import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const items = await prisma.budgetItem.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }] });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching budget:', error);
    return NextResponse.json({ error: 'Failed to fetch budget' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { category, description, estimated, actual, paid, notes } = await request.json();
    if (!category?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Category and description are required' }, { status: 400 });
    }
    const maxOrder = await prisma.budgetItem.aggregate({ _max: { order: true } });
    const item = await prisma.budgetItem.create({
      data: {
        category: category.trim(),
        description: description.trim(),
        estimated: typeof estimated === 'number' ? estimated : 0,
        actual: typeof actual === 'number' ? actual : 0,
        paid: !!paid,
        notes: notes?.trim() || null,
        order: (maxOrder._max.order || 0) + 1,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error creating budget item:', error);
    return NextResponse.json({ error: 'Failed to create budget item' }, { status: 500 });
  }
}
