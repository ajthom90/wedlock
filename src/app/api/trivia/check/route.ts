import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Guests POST their answers here and get back which ones were correct. Doing
// the check server-side keeps the correct answers off the wire to the guest
// phones, so they can't peek via devtools.
export async function POST(request: Request) {
  try {
    const { answers } = await request.json();
    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'answers is required' }, { status: 400 });
    }
    const questions = await prisma.triviaQuestion.findMany();
    const results = questions.map((q) => ({
      id: q.id,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      userAnswer: typeof answers[q.id] === 'number' ? answers[q.id] : null,
      isCorrect: answers[q.id] === q.correctIndex,
    }));
    const score = results.filter((r) => r.isCorrect).length;
    return NextResponse.json({ score, total: questions.length, results });
  } catch (error) {
    console.error('Error checking trivia:', error);
    return NextResponse.json({ error: 'Failed to check answers' }, { status: 500 });
  }
}
