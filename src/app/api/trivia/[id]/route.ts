import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('question' in body) data.question = body.question?.trim();
    if ('choices' in body && Array.isArray(body.choices)) {
      data.choices = JSON.stringify(body.choices.map((c: string) => c.trim()).filter((c: string) => c));
    }
    if ('correctIndex' in body && typeof body.correctIndex === 'number') data.correctIndex = body.correctIndex;
    if ('explanation' in body) data.explanation = body.explanation?.trim() || null;
    if ('order' in body && typeof body.order === 'number') data.order = body.order;

    const item = await prisma.triviaQuestion.update({ where: { id }, data });
    return NextResponse.json({ ...item, choices: JSON.parse(item.choices) });
  } catch (error) {
    console.error('Error updating trivia question:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.triviaQuestion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting trivia question:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
