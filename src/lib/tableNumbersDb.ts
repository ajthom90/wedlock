// One-time upgrade: move the sort prefix couples put in table names
// ("05. Smith Family") into the table's number field and strip it from the
// name (rules in tableNumbers.ts). Runs on the first read of seating after a
// deploy and records itself — with every table's old name — in the Setting
// table, so it never runs again and can be traced back. Tables whose names
// don't start with "NN. ", or that already have a number, are left alone.

import prisma from './prisma';
import { splitTablePrefix } from './tableNumbers';

export const TABLE_NUMBERS_SETTING = 'migration.tableNumbersFromNames';

let running: Promise<void> | null = null;

export function ensureTableNumbers(): Promise<void> {
  if (!running) {
    running = splitTableNumbersOnce().catch((error) => {
      // Let a later request try again rather than leaving prefixes in place.
      running = null;
      console.error('Moving table numbers out of table names failed:', error);
    });
  }
  return running;
}

export async function splitTableNumbersOnce(): Promise<void> {
  if (await prisma.setting.findUnique({ where: { key: TABLE_NUMBERS_SETTING } })) return;

  const tables = await prisma.seatingTable.findMany({ select: { id: true, name: true, number: true } });
  const changes = tables.flatMap((t) => {
    if (t.number != null) return [];
    const split = splitTablePrefix(t.name);
    return split ? [{ id: t.id, from: t.name, name: split.name, number: split.number }] : [];
  });

  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.seatingTable.update({ where: { id: c.id }, data: { name: c.name, number: c.number } });
    }
    await tx.setting.create({
      data: { key: TABLE_NUMBERS_SETTING, value: JSON.stringify({ at: new Date().toISOString(), tables: tables.length, changes }) },
    });
  });

  if (changes.length) console.log(`Moved table numbers out of ${changes.length} of ${tables.length} table names.`);
}
