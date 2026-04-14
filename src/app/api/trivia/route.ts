import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    // Admin sees everything (including answers). Guests get the public view
    // with the correct answers stripped so we don't leak them in flight.
    const authed = await isAuthenticated();
    const items = await prisma.triviaQuestion.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    const parsed = items.map((q) => ({
      ...q,
      choices: JSON.parse(q.choices || '[]') as string[],
    }));
    if (authed) return NextResponse.json(parsed);
    return NextResponse.json(
      parsed.map(({ correctIndex: _, explanation: __, ...rest }) => rest),
    );
  } catch (error) {
    console.error('Error fetching trivia:', error);
    return NextResponse.json({ error: 'Failed to fetch trivia' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { question, choices, correctIndex, explanation } = await request.json();
    if (!question?.trim() || !Array.isArray(choices) || choices.length < 2) {
      return NextResponse.json({ error: 'Question and at least 2 choices are required' }, { status: 400 });
    }
    const maxOrder = await prisma.triviaQuestion.aggregate({ _max: { order: true } });
    const item = await prisma.triviaQuestion.create({
      data: {
        question: question.trim(),
        choices: JSON.stringify(choices.map((c: string) => c.trim()).filter((c: string) => c)),
        correctIndex: typeof correctIndex === 'number' ? correctIndex : 0,
        explanation: explanation?.trim() || null,
        order: (maxOrder._max.order || 0) + 1,
      },
    });
    return NextResponse.json({ ...item, choices: JSON.parse(item.choices) });
  } catch (error) {
    console.error('Error creating trivia question:', error);
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 });
  }
}
