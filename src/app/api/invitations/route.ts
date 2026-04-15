import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { generateCode } from '@/lib/utils';

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    if (!(await prisma.invitation.findUnique({ where: { code } }))) return code;
  }
  throw new Error('Could not generate unique code');
}

export async function GET() {
  try {
    const invitations = await prisma.invitation.findMany({
      include: {
        guests: true,
        response: true,
        changeLogs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { householdName, email, maxGuests, plusOnesAllowed, notes, guestNames } = await request.json();
    if (!householdName) return NextResponse.json({ error: 'Household name is required' }, { status: 400 });
    const code = await generateUniqueCode();
    const invitation = await prisma.invitation.create({
      data: {
        code, householdName, email: email || null, maxGuests: maxGuests || 2,
        plusOnesAllowed: Math.max(0, parseInt(plusOnesAllowed) || 0),
        notes: notes || null,
        guests: { create: guestNames?.map((name: string, i: number) => ({ name, isPrimary: i === 0 })) || [] },
      },
      include: { guests: true },
    });
    return NextResponse.json(invitation);
  } catch (error) {
    console.error('Error creating invitation:', error);
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }
}
