import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseWorkbook, bucketRows, dupeKey } from '@/lib/invitationImport';

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = await parseWorkbook(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read Excel file';
      return NextResponse.json({ error: `Could not read Excel file — ${message}` }, { status: 400 });
    }

    // Build the existing-keys set from DB. Only need the fields dupeKey reads.
    const existing = await prisma.invitation.findMany({
      select: {
        householdName: true,
        mailingAddress1: true,
        mailingAddress2: true,
        mailingCity: true,
        mailingState: true,
        mailingPostalCode: true,
      },
    });
    const existingKeys = new Set(existing.map((inv) => dupeKey({
      householdName: inv.householdName,
      email: null, contactEmail: null,
      mailingAddress1: inv.mailingAddress1,
      mailingAddress2: inv.mailingAddress2,
      mailingCity: inv.mailingCity,
      mailingState: inv.mailingState,
      mailingPostalCode: inv.mailingPostalCode,
      plusOnesAllowed: 0, notes: null, guestNames: [],
    })));

    const buckets = bucketRows(parsed, existingKeys);

    return NextResponse.json({
      totalRows: parsed.length,
      existingInvitationCount: existing.length,
      ready: buckets.ready,
      duplicate: buckets.duplicate,
      error: buckets.error,
    });
  } catch (error) {
    console.error('Error previewing invitation import:', error);
    return NextResponse.json({ error: 'Failed to preview import' }, { status: 500 });
  }
}
