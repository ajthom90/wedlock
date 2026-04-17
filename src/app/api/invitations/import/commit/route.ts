import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateCode } from '@/lib/utils';
import { validateRow, type NormalizedRow, type ParsedRow } from '@/lib/invitationImport';

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    if (!(await prisma.invitation.findUnique({ where: { code } }))) return code;
  }
  throw new Error('Could not generate unique invitation code');
}

type Failure = { rowNumber: number; householdName: string; error: string };

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { rows?: Array<NormalizedRow & { rowNumber?: number }> };
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'Expected { rows: NormalizedRow[] }' }, { status: 400 });
    }

    // Re-validate every row server-side — defense-in-depth against a client
    // that skipped validation. If any row is invalid, reject the whole chunk.
    const validationErrors: Array<{ rowNumber: number; errors: string[] }> = [];
    for (const r of body.rows) {
      const pseudo: ParsedRow = { rowNumber: r.rowNumber ?? 0, raw: {}, normalized: r };
      const v = validateRow(pseudo);
      if (v.errors.length > 0) {
        validationErrors.push({ rowNumber: pseudo.rowNumber, errors: v.errors });
      }
    }
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', validationErrors }, { status: 400 });
    }

    // Sequential row-by-row. Per-row failures are caught and reported — they
    // don't abort the rest of the chunk. (No outer transaction: per the spec,
    // we want partial success with a failure report, not all-or-nothing.)
    let createdCount = 0;
    const failures: Failure[] = [];
    for (const r of body.rows) {
      try {
        const code = await generateUniqueCode();
        const maxGuests = r.guestNames.length + r.plusOnesAllowed;
        await prisma.invitation.create({
          data: {
            code,
            householdName: r.householdName.trim(),
            email: r.email?.trim() || null,
            contactEmail: r.contactEmail?.trim() || null,
            mailingAddress1: r.mailingAddress1?.trim() || null,
            mailingAddress2: r.mailingAddress2?.trim() || null,
            mailingCity: r.mailingCity?.trim() || null,
            mailingState: r.mailingState?.trim() || null,
            mailingPostalCode: r.mailingPostalCode?.trim() || null,
            maxGuests: maxGuests > 0 ? maxGuests : 2,
            plusOnesAllowed: r.plusOnesAllowed,
            notes: r.notes?.trim() || null,
            guests: {
              create: r.guestNames.map((name, i) => ({
                name: name.trim(),
                isPrimary: i === 0,
              })),
            },
          },
        });
        createdCount++;
      } catch (err) {
        failures.push({
          rowNumber: r.rowNumber ?? 0,
          householdName: r.householdName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ createdCount, failedCount: failures.length, failures });
  } catch (error) {
    console.error('Error committing invitation import:', error);
    return NextResponse.json({ error: 'Failed to commit import' }, { status: 500 });
  }
}
