// Builds the "Reception Seating" vendor sheet in the layout couples hand to
// caterers and venue staff: a summary block (meal counts with their colors,
// vendor meals, total, and A / B / H counts) above one row per seated guest.
// Returns a plain grid of cell values so the layout can be unit-tested and
// compared cell for cell against a couple's own sheet; the API route only
// writes the grid out with ExcelJS. Pure — no Prisma/ExcelJS.

import { tableDisplayName } from './nameTentsPdf';
import { buildMealColorMap, mealColorFor } from './mealColors';
import type { RsvpChoice } from './rsvpChoices';
import { parseVendorMeals, type VendorMeal } from './vendorMeals';
import {
  resolveSeatedGuests,
  UNASSIGNED_TABLE,
  type SeatedGuest,
  type SeatingExportInvitation,
  type SeatingExportTable,
} from './seatingExport';

export type SheetCell = string | number | null;


export interface ReceptionSheet {
  rows: SheetCell[][];
  /** 1-based row number of the "Guest Name" header row. */
  headerRow: number;
}

export const RECEPTION_SHEET_NAME = 'Reception Seating';

// Labels exactly as the couple's sheet has them, "Height Chairs" included, so
// vendors who already work from that sheet see the same words.
export const LABELS = {
  mealChoice: 'Meal Choice',
  colorCode: 'Color Code',
  total: 'Total:',
  allergens: 'Allergens / Restrictions (A)',
  boosters: 'Booster Chairs (B)',
  highChairs: 'Height Chairs (H)',
  noMeal: 'No meal chosen',
} as const;

export const GUEST_HEADERS = ['Guest Name', 'Table#', 'Meal Choice', 'Dietary Restrictions', 'H / B', 'A', 'Color Code'];

/**
 * What goes in the Table# cell: the table's number when it has one;
 * otherwise the number on its own for a numbered name ("5", "Table 5",
 * "05. 5" → 5), else the table's name with any sort prefix stripped
 * ("00. Head Table" → "Head Table").
 */
export function sheetTableValue(raw: string, number?: number | null): string | number {
  if (number != null) return number;
  const shown = tableDisplayName(raw);
  const m = /^table\s+(\d+)$/i.exec(shown);
  return m ? Number(m[1]) : shown;
}

/** Named tables (Head Table) first in site order, then numbered tables by number, Unassigned last. */
function tableRank(g: SeatedGuest): [number, number] {
  if (g.table === UNASSIGNED_TABLE) return [2, 0];
  const v = sheetTableValue(g.table, g.tableNumber);
  return typeof v === 'number' ? [1, v] : [0, 0];
}

export function orderForSheet(guests: SeatedGuest[]): SeatedGuest[] {
  // Stable sort: guests keep their order within a table, and named tables
  // keep the site's own order among themselves.
  return guests
    .map((g, i) => ({ g, i, r: tableRank(g) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map((x) => x.g);
}

const childSeatMark = (g: SeatedGuest) => (g.childSeat === 'high_chair' ? 'H' : g.childSeat === 'booster' ? 'B' : '');

export function buildReceptionSheet(args: {
  tables: SeatingExportTable[];
  invitations: SeatingExportInvitation[];
  mealChoices: RsvpChoice[];
  vendorMeals: VendorMeal[];
}): ReceptionSheet {
  const guests = orderForSheet(resolveSeatedGuests(args.tables, args.invitations));
  const colors = buildMealColorMap(args.mealChoices);
  const colorName = (meal: string) => mealColorFor(meal, colors)?.name ?? '';

  // Meal counts in the order the meals are set up on RSVP Configuration, then
  // any meal a guest has that's no longer offered, then guests with none, so
  // the counts always add up to everyone on the list.
  const counts = new Map<string, { name: string; count: number; color: string }>();
  for (const c of args.mealChoices) {
    const key = c.name.trim().toLowerCase();
    if (key && !counts.has(key)) counts.set(key, { name: c.name.trim(), count: 0, color: colorName(c.name) });
  }
  let noMeal = 0;
  for (const g of guests) {
    const meal = g.meal.trim();
    if (!meal) { noMeal++; continue; }
    const key = meal.toLowerCase();
    const entry = counts.get(key) ?? { name: meal, count: 0, color: colorName(meal) };
    entry.count++;
    counts.set(key, entry);
  }

  const allergens = guests.filter((g) => g.dietary.trim()).length;
  const boosters = guests.filter((g) => g.childSeat === 'booster').length;
  const highChairs = guests.filter((g) => g.childSeat === 'high_chair').length;
  const vendorMeals = parseVendorMeals(args.vendorMeals);
  const vendorTotal = vendorMeals.reduce((sum, v) => sum + v.count, 0);

  const rows: SheetCell[][] = [[LABELS.mealChoice, null, LABELS.colorCode]];
  for (const m of counts.values()) rows.push([m.name, m.count, m.color]);
  if (noMeal) rows.push([LABELS.noMeal, noMeal, null]);

  // Vendor meals sit between the guest meals and the total, and the A / B / H
  // counts go beside the last three of those rows (C and D), as on the
  // couple's sheet with its two vendor meals. With fewer than two vendor
  // meals, blank rows keep A and B off the meal rows, whose C is a color.
  const tail: SheetCell[][] = vendorMeals.map((v) => [v.name, v.count]);
  while (tail.length < 2) tail.push([null, null]);
  tail.push([LABELS.total, guests.length + vendorTotal]);
  const marks: [string, number][] = [[LABELS.allergens, allergens], [LABELS.boosters, boosters], [LABELS.highChairs, highChairs]];
  marks.forEach(([label, n], i) => {
    const row = tail[tail.length - 3 + i];
    row[2] = label;
    row[3] = n;
  });
  rows.push(...tail);

  rows.push([...GUEST_HEADERS]);
  const headerRow = rows.length;
  for (const g of guests) {
    // A household note nobody's been assigned yet still reaches the vendor,
    // labelled, but only a guest's own note earns them the A.
    const dietary = [g.dietary.trim(), g.householdDietary && `Household: ${g.householdDietary}`].filter(Boolean).join('; ');
    rows.push([
      g.guestName.trim(),
      sheetTableValue(g.table, g.tableNumber),
      g.meal.trim() || null,
      dietary || null,
      childSeatMark(g) || null,
      g.dietary.trim() ? 'A' : null,
      colorName(g.meal) || null,
    ]);
  }
  return { rows, headerRow };
}

/**
 * The grid as tab-separated text, one line per row with trailing empty cells
 * dropped: the same shape a spreadsheet's plain-text rendering takes, so a
 * couple's own sheet can be diffed against the export.
 */
export function sheetToText(rows: SheetCell[][]): string {
  return rows
    .map((r) => {
      const cells = r.map((c) => (c == null ? '' : String(c)));
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      return cells.join('\t');
    })
    .join('\n');
}
