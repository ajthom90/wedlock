import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

// Seats link to the Guest row (guestId) so a rename keeps the guest at their
// table. Plus-ones have no Guest row and are seated by name + invitation.

// POST { tableId, guestId } seats a guest (moving them if already seated);
// POST { tableId, guestName, invitationId } seats a plus-one.
export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { tableId, guestId, guestName, invitationId } = await request.json();
    if (typeof guestId === 'string' && guestId) {
      const guest = await prisma.guest.findUnique({ where: { id: guestId } });
      if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
      const data = { tableId, guestId, guestName: guest.name, invitationId: guest.invitationId };
      const assignment = await prisma.tableAssignment.upsert({ where: { guestId }, create: data, update: data });
      return NextResponse.json(assignment);
    }
    if (typeof guestName !== 'string' || !guestName.trim()) {
      return NextResponse.json({ error: 'guestId or guestName is required' }, { status: 400 });
    }
    const assignment = await prisma.tableAssignment.create({ data: { tableId, guestName, invitationId: invitationId || null } });
    return NextResponse.json(assignment);
  } catch (error) {
    console.error('Error creating table assignment:', error);
    return NextResponse.json({ error: 'Failed to create table assignment' }, { status: 500 });
  }
}

// PATCH { assignmentId, tableId } moves a seat to another table, keeping its
// link; PATCH { assignmentId, guestId } links a flagged seat to a guest.
export async function PATCH(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { assignmentId, tableId, guestId } = await request.json();
    const data: { tableId?: string; guestId?: string; guestName?: string; invitationId?: string } = {};
    if (typeof tableId === 'string' && tableId) data.tableId = tableId;
    if (typeof guestId === 'string' && guestId) {
      const guest = await prisma.guest.findUnique({ where: { id: guestId }, include: { seat: { include: { table: true } } } });
      if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
      if (guest.seat && guest.seat.id !== assignmentId) {
        return NextResponse.json({ error: `${guest.name} is already seated at ${guest.seat.table.name}` }, { status: 409 });
      }
      Object.assign(data, { guestId, guestName: guest.name, invitationId: guest.invitationId });
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    const assignment = await prisma.tableAssignment.update({ where: { id: assignmentId }, data });
    return NextResponse.json(assignment);
  } catch (error) {
    console.error('Error updating table assignment:', error);
    return NextResponse.json({ error: 'Failed to update table assignment' }, { status: 500 });
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
