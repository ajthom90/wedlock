import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { tableId, guestName, invitationId } = await request.json();
    const assignment = await prisma.tableAssignment.create({ data: { tableId, guestName, invitationId: invitationId || null } });
    return NextResponse.json(assignment);
  } catch (error) {
    console.error('Error creating table assignment:', error);
    return NextResponse.json({ error: 'Failed to create table assignment' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { assignmentId } = await request.json();
    await prisma.tableAssignment.delete({ where: { id: assignmentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting table assignment:', error);
    return NextResponse.json({ error: 'Failed to delete table assignment' }, { status: 500 });
  }
}
