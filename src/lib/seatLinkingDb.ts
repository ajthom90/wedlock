// One-time upgrade: link seats saved before TableAssignment.guestId existed
// to their Guest rows (rules in seatLinking.ts). Runs on the first read of
// seating after a deploy and records itself in the Setting table, so it never
// runs again; seats it couldn't match keep guestId null and are flagged on
// the admin Seating page. Nothing is deleted.

import prisma from './prisma';
import { planSeatLinks, plusOnesOf, type SeatLinkPlan } from './seatLinking';

export const SEAT_LINK_SETTING = 'migration.seatsLinkedToGuests';

let running: Promise<void> | null = null;

export function ensureSeatsLinked(): Promise<void> {
  if (!running) {
    running = linkSeatsOnce().catch((error) => {
      // Let a later request try again rather than leaving seats unlinked.
      running = null;
      console.error('Linking seats to guests failed:', error);
    });
  }
  return running;
}

async function linkSeatsOnce(): Promise<void> {
  if (await prisma.setting.findUnique({ where: { key: SEAT_LINK_SETTING } })) return;

  const [seats, invitations] = await Promise.all([
    prisma.tableAssignment.findMany({ include: { table: { select: { name: true } } } }),
    prisma.invitation.findMany({ include: { guests: true, response: true } }),
  ]);
  const plan: SeatLinkPlan = planSeatLinks(
    seats,
    invitations.flatMap((inv) => inv.guests.map((g) => ({ id: g.id, name: g.name, invitationId: inv.id }))),
    invitations.flatMap(plusOnesOf),
  );

  const tableOf = new Map(seats.map((s) => [s.id, s.table.name]));
  const summary = {
    at: new Date().toISOString(),
    seats: seats.length,
    linked: plan.links.length,
    renamed: plan.links.filter((l) => l.how === 'renamed').length,
    plusOnes: plan.plusOnes.length,
    flagged: plan.flagged.map((f) => ({ ...f, table: tableOf.get(f.seatId) ?? '' })),
  };

  await prisma.$transaction(async (tx) => {
    for (const l of plan.links) {
      await tx.tableAssignment.updateMany({ where: { id: l.seatId, guestId: null }, data: { guestId: l.guestId } });
    }
    await tx.setting.create({ data: { key: SEAT_LINK_SETTING, value: JSON.stringify(summary) } });
  });

  console.log(
    `Linked ${summary.linked} of ${summary.seats} seats to guests (${summary.renamed} by renamed match), ` +
      `${summary.plusOnes} plus-one seats, ${summary.flagged.length} flagged for review.`,
  );
}
