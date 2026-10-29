import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReceptionSheet } from './receptionSheet';
import { receptionWorkbookBuffer } from './receptionWorkbook';
import type { SeatingExportInvitation } from './seatingExport';

const invitation: SeatingExportInvitation = {
  id: 'a',
  guests: [{ id: 'a-0', name: 'Ann Lee', childSeat: null }, { id: 'a-1', name: 'Bo Lee', childSeat: 'booster' }],
  response: {
    attending: 'yes',
    attendingGuests: JSON.stringify(['a-0', 'a-1']),
    guestMeals: JSON.stringify({ 'a-0': 'Beef', 'a-1': "Kid's Meal" }),
    guestDietary: JSON.stringify({ 'a-0': 'Gluten Free' }),
    plusOnes: null,
    dietaryNotes: null,
  },
};

describe('receptionWorkbookBuffer', () => {
  it('writes the Reception Seating sheet with meal colors filled in', async () => {
    const sheet = buildReceptionSheet({
      tables: [{ name: 'Cousins', number: 7, assignments: [{ guestName: 'Ann Lee', invitationId: 'a' }, { guestName: 'Bo Lee', invitationId: 'a' }] }],
      invitations: [invitation],
      mealChoices: [{ name: 'Beef', color: 'Red' }, { name: "Kid's Meal", color: 'Pink' }],
      vendorMeals: [{ name: 'Standard Vendor Meals', count: 10 }, { name: 'Vegetarian Vendor Meal', count: 1 }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await receptionWorkbookBuffer(sheet)) as unknown as ExcelJS.Buffer);

    expect(wb.worksheets.map((w) => w.name)).toEqual(['Reception Seating']);
    const ws = wb.getWorksheet('Reception Seating')!;
    const values = (r: number) => (ws.getRow(r).values as unknown[]).slice(1);

    expect(values(1)).toEqual(['Meal Choice', undefined, 'Color Code']);
    expect(values(2)).toEqual(['Beef', 1, 'Red']);
    expect(values(4)).toEqual(['Standard Vendor Meals', 10, 'Allergens / Restrictions (A)', 1]);
    expect(values(6)).toEqual(['Total:', 13, 'Height Chairs (H)', 0]);
    expect(values(sheet.headerRow)).toEqual(['Guest Name', 'Table#', 'Meal Choice', 'Dietary Restrictions', 'H / B', 'A', 'Color Code']);
    expect(values(sheet.headerRow + 1)).toEqual(['Ann Lee', 7, 'Beef', 'Gluten Free', undefined, 'A', 'Red']);
    expect(values(sheet.headerRow + 2)).toEqual(['Bo Lee', 7, "Kid's Meal", undefined, 'B', undefined, 'Pink']);

    const fill = (r: number, c: number) => (ws.getCell(r, c).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    expect(fill(2, 3)).toBe('FFD62828');
    expect(fill(sheet.headerRow + 1, 7)).toBe('FFD62828');
    expect(fill(sheet.headerRow + 2, 7)).toBe('FFF27BB5');
    expect(fill(4, 3)).toBeUndefined();
    const border = (r: number, c: number) => ws.getCell(r, c).border?.bottom?.style;
    expect(border(sheet.headerRow, 1)).toBe('thin');
    expect(border(sheet.headerRow + 2, 4)).toBe('thin'); // blank guest cell still ruled
    expect(border(2, 1)).toBe('thin');
    expect(border(2, 4)).toBeUndefined(); // nothing in the summary there
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getRow(sheet.headerRow).font?.bold).toBe(true);
  });
});
