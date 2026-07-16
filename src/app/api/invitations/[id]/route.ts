import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { reconcileGuests } from '@/lib/guestReconcile';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const invitation = await prisma.invitation.findUnique({ where: { id }, include: { guests: { orderBy: { order: 'asc' } }, response: true } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    return NextResponse.json(invitation);
  } catch (error) {
    console.error('Error fetching invitation:', error);
    return NextResponse.json({ error: 'Failed to fetch invitation' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { householdName, email, maxGuests, plusOnesAllowed, notes, guests, guestNames, isWeddingParty, mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingPostalCode } = await request.json();
    // Reconcile guest rows instead of delete-and-recreate: Guest IDs are
    // referenced by RsvpResponse.attendingGuests/guestMeals, so surviving
    // guests must keep their rows or existing RSVPs orphan. The admin UI
    // sends `guests: [{id, name}]` so renamed rows keep their identity; the
    // legacy `guestNames: string[]` shape still works (name matching only).
    const incoming: { id?: string | null; name: string }[] = Array.isArray(guests)
      ? guests
          .filter((g: any) => g && typeof g.name === 'string' && g.name.trim())
          .map((g: any) => ({ id: typeof g.id === 'string' ? g.id : null, name: g.name }))
      : Array.isArray(guestNames)
        ? guestNames.filter((n: any) => typeof n === 'string').map((name: string) => ({ name }))
        : [];
    const existingGuests = await prisma.guest.findMany({ where: { invitationId: id } });
    const guestOps = reconcileGuests(
      existingGuests.map((g) => ({ id: g.id, name: g.name })),
      incoming,
    );
    const invitation = await prisma.$transaction(async (tx) => {
      for (const u of guestOps.update) {
        await tx.guest.update({ where: { id: u.id }, data: { name: u.name, isPrimary: u.isPrimary, order: u.order } });
      }
      if (guestOps.deleteIds.length > 0) {
        await tx.guest.deleteMany({ where: { id: { in: guestOps.deleteIds } } });
        // A genuinely removed guest must also leave the household's RSVP —
        // otherwise their id lingers in attendingGuests/guestMeals and the
        // stored guestCount overstates the party.
        const response = await tx.rsvpResponse.findUnique({ where: { invitationId: id } });
        if (response?.attendingGuests) {
          try {
            const removed = new Set(guestOps.deleteIds);
            const ids: string[] = JSON.parse(response.attendingGuests);
            const kept = ids.filter((gid) => !removed.has(gid));
            if (kept.length !== ids.length) {
              let meals: Record<string, string> = {};
              try { meals = JSON.parse(response.guestMeals || '{}'); } catch { meals = {}; }
              for (const gid of removed) delete meals[gid];
              let plusOnesCount = 0;
              try { plusOnesCount = (JSON.parse(response.plusOnes || '[]') as unknown[]).length; } catch { plusOnesCount = 0; }
              await tx.rsvpResponse.update({
                where: { id: response.id },
                data: {
                  attendingGuests: JSON.stringify(kept),
                  guestMeals: Object.keys(meals).length ? JSON.stringify(meals) : null,
                  guestCount: kept.length + plusOnesCount,
                },
              });
            }
          } catch (parseError) {
            console.error('Skipping RSVP scrub — unparseable attendingGuests:', parseError);
          }
        }
      }
      return tx.invitation.update({
        where: { id },
        data: {
          householdName, email: email || null, maxGuests: maxGuests || 2,
          plusOnesAllowed: Math.max(0, parseInt(plusOnesAllowed) || 0),
          notes: notes || null,
          isWeddingParty: Boolean(isWeddingParty),
          mailingAddress1: mailingAddress1 || null,
          mailingAddress2: mailingAddress2 || null,
          mailingCity: mailingCity || null,
          mailingState: mailingState || null,
          mailingPostalCode: mailingPostalCode || null,
          guests: { create: guestOps.create },
        },
        include: { guests: { orderBy: { order: 'asc' } }, response: true },
      });
    });
    return NextResponse.json(invitation);
  } catch (error) {
    console.error('Error updating invitation:', error);
    return NextResponse.json({ error: 'Failed to update invitation' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.invitation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invitation:', error);
    return NextResponse.json({ error: 'Failed to delete invitation' }, { status: 500 });
  }
}
