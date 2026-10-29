import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReceptionSheet } from './receptionSheet';
import { countifCriterion, receptionWorkbookBuffer } from './receptionWorkbook';
import type { SeatingExportInvitation } from './seatingExport';

const invitation: SeatingExportInvitation = {
  id: 'a',
  guests: [{ id: 'a-0', name: 'Ann Lee', childSeat: null }, { id: 'a-1', name: 'Bo Lee', childSeat: 'booster' }, { id: 'a-2', name: 'Cy Lee', childSeat: null }],
  response: {
    attending: 'yes',
    attendingGuests: JSON.stringify(['a-0', 'a-1', 'a-2']),
    guestMeals: JSON.stringify({ 'a-0': 'Beef', 'a-1': "Kid's Meal" }),
    guestDietary: JSON.stringify({ 'a-0': 'Gluten Free' }),
    plusOnes: null,
    dietaryNotes: null,
  },
};

const sheet = buildReceptionSheet({
  tables: [
    { name: 'Head Table', number: null, assignments: [{ guestName: 'Ann Lee', invitationId: 'a' }] },
    { name: 'Cousins', number: 7, assignments: [{ guestName: 'Bo Lee', invitationId: 'a' }, { guestName: 'Cy Lee', invitationId: 'a' }] },
  ],
  invitations: [invitation],
  mealChoices: [{ name: 'Beef', color: 'Red' }, { name: "Kid's Meal", color: 'Pink' }],
  vendorMeals: [{ name: 'Standard Vendor Meals', count: 10 }, { name: 'Vegetarian Vendor Meal', count: 1 }],
});

async function load() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await receptionWorkbookBuffer(sheet)) as unknown as ExcelJS.Buffer);
  return wb;
}

describe('receptionWorkbookBuffer', () => {
  // Layout: 1 header, 2 Beef, 3 Kid's Meal, 4 No meal chosen, 5-6 vendor
  // meals, 7 Total, 8 blank, 9 guest header, 10-12 guests.
  it('lays the sheet out like the couple’s, with a blank row before the guest list', async () => {
    const wb = await load();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Reception Seating']);
    const ws = wb.getWorksheet('Reception Seating')!;
    expect(sheet.headerRow).toBe(9);
    expect(ws.getCell('A8').value).toBeNull();
    expect((ws.getRow(9).values as unknown[]).slice(1)).toEqual(['Guest Name', 'Table#', 'Meal Choice', 'Dietary Restrictions', 'H / B', 'A', 'Color Code']);
    expect(ws.getCell('A10').value).toBe('Ann Lee');
    expect(ws.getCell('B10').value).toBe('Head Table');
    expect(ws.getCell('B11').value).toBe(7);
  });

  it('writes the counts as live formulas with their results', async () => {
    const ws = (await load()).getWorksheet('Reception Seating')!;
    const f = (a: string) => ws.getCell(a).value as { formula: string; result: unknown };
    expect(f('B2')).toMatchObject({ formula: 'COUNTIF($C$10:$C$12,"Beef")', result: 1 });
    expect(f('B3')).toMatchObject({ formula: 'COUNTIF($C$10:$C$12,"Kid\'s Meal")', result: 1 });
    expect(f('B4')).toMatchObject({ formula: 'COUNTBLANK($C$10:$C$12)', result: 1 });
    expect(ws.getCell('B5').value).toBe(10);
    expect(f('B7')).toMatchObject({ formula: 'SUM(B2:B6)', result: 14 });
    expect(f('D5')).toMatchObject({ formula: 'COUNTIF($F$10:$F$12,"A")', result: 1 });
    expect(f('D6')).toMatchObject({ formula: 'COUNTIF($E$10:$E$12,"B")', result: 1 });
    expect(f('D7').formula).toBe('COUNTIF($E$10:$E$12,"H")'); // a 0 result is written but not read back
    expect(f('G10')).toMatchObject({ formula: 'IFERROR(VLOOKUP(C10,$A$2:$C$4,3,FALSE)&"","")', result: 'Red' });
    expect(f('G12').formula).toBe('IFERROR(VLOOKUP(C12,$A$2:$C$4,3,FALSE)&"","")'); // no meal: blank
  });

  it('formats like the couple’s sheet: merged A1:B1, boxed summary, ruled header, frozen rows, no fills', async () => {
    const ws = (await load()).getWorksheet('Reception Seating')!;
    const b = (a: string) => {
      const x = ws.getCell(a).border ?? {};
      return [x.left?.style, x.right?.style, x.top?.style, x.bottom?.style];
    };
    expect(ws.getCell('B1').isMerged).toBe(true);
    expect(b('A1')).toEqual(['medium', undefined, undefined, 'medium']);
    expect(b('C1')).toEqual(['medium', 'medium', 'medium', undefined]);
    expect(b('A2')).toEqual(['medium', 'medium', 'medium', 'thin']);
    expect(b('B3')).toEqual([undefined, undefined, 'thin', 'thin']);
    expect(b('C4')).toEqual(['medium', 'medium', 'thin', 'medium']);
    expect(b('B6')).toEqual([undefined, 'medium', 'thin', 'medium']);
    expect(b('A7')).toEqual(['medium', 'medium', undefined, 'medium']);
    expect(b('C5')).toEqual([undefined, undefined, undefined, undefined]);
    expect(b('E9')).toEqual([undefined, undefined, undefined, 'medium']);
    expect(b('A10')).toEqual([undefined, undefined, undefined, undefined]);

    expect(ws.getCell('A2').font.bold).toBe(true);
    expect(ws.getCell('A2').alignment.horizontal).toBe('right');
    expect(ws.getCell('C2').alignment.horizontal).toBe('left');
    expect(ws.getCell('C5').font.bold).toBe(true);
    expect(ws.getCell('A9').font.bold).toBe(true);
    expect(ws.getCell('A10').font.bold).toBeFalsy();
    expect(ws.getCell('B10').alignment.horizontal).toBe('right');
    expect(ws.getCell('E11').alignment.horizontal).toBe('center');
    expect(ws.getCell('F10').alignment.horizontal).toBe('center');

    for (const a of ['A2', 'C2', 'G10']) expect((ws.getCell(a).fill as ExcelJS.FillPattern | undefined)?.pattern ?? 'none').toBe('none');
    expect(ws.columns.map((c) => c.width)).toEqual([30, 10.5546875, 25.5546875, 34.44140625, 7.33203125, 3.6640625, 10.44140625]);
    expect([1, 4, 6, 7, 9].map((r) => ws.getRow(r).height)).toEqual([15, 15, 15, 15, 15]);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 9 });
  });
});

describe('countifCriterion', () => {
  it('quotes the text and escapes what COUNTIF would read as wildcards', () => {
    expect(countifCriterion('Beef')).toBe('"Beef"');
    expect(countifCriterion('Fish *GF*')).toBe('"Fish ~*GF~*"');
    expect(countifCriterion('What? "Chef\'s" ~')).toBe('"What~? ""Chef\'s"" ~~"');
  });
});
