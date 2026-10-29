// Loads live seating, RSVPs, meal choices and vendor meals and builds the
// Reception Seating grid from them. Shared by both seating downloads.

import prisma from './prisma';
import { getSiteSettings } from './settings';
import { parseRsvpChoices } from './rsvpChoices';
import { buildReceptionSheet, type ReceptionSheet } from './receptionSheet';

export async function loadReceptionSheet(): Promise<ReceptionSheet> {
  const [tables, invitations, mealOptions, site] = await Promise.all([
    prisma.seatingTable.findMany({ include: { assignments: { include: { guest: { select: { id: true, name: true, invitationId: true } } } } } }),
    prisma.invitation.findMany({ include: { guests: { orderBy: { order: 'asc' } }, response: true } }),
    prisma.rsvpOption.findMany({ where: { type: 'meal' }, orderBy: { order: 'asc' } }),
    getSiteSettings(),
  ]);
  return buildReceptionSheet({
    tables,
    invitations,
    mealChoices: mealOptions.flatMap((o) => parseRsvpChoices(o.choices)),
    vendorMeals: site.vendorMeals,
  });
}
