// Writes the Reception Seating grid (receptionSheet.ts) to an .xlsx with
// ExcelJS, formatted like the couple's own sheet: the summary boxed in
// medium and thin borders with A1:B1 merged, its counts as live formulas
// (COUNTIF over the guest list, SUM for the total) so they follow any edit
// the caterer makes, Color Code looked up from the summary with VLOOKUP, a
// medium rule under the guest header, the rows above the guest list frozen,
// and the couple's column widths. Every formula carries its result, so the
// sheet reads right even where nothing recalculates. No fills: the couple's
// sheet has none. Shared by both seating downloads on the admin Seating page.

import ExcelJS from 'exceljs';
import { RECEPTION_SHEET_NAME, type ReceptionSheet, type SheetCell } from './receptionSheet';

// Column widths and the 15pt rows (the ones with a medium rule) as the
// couple's sheet has them.
const COLUMN_WIDTHS = [30, 10.5546875, 25.5546875, 34.44140625, 7.33203125, 3.6640625, 10.44140625];
const RULED_ROW_HEIGHT = 15;

const FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, family: 2, color: { theme: 1 } };
const BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true };
const MEDIUM = { style: 'medium' } as ExcelJS.Border;
const THIN = { style: 'thin' } as ExcelJS.Border;

/** A COUNTIF criterion matching the text exactly: quotes doubled, wildcards escaped. */
export function countifCriterion(text: string): string {
  return `"${text.replace(/[~*?]/g, '~$&').replace(/"/g, '""')}"`;
}

export function buildReceptionWorkbook(sheet: ReceptionSheet): ExcelJS.Workbook {
  const { rows, headerRow, summary: s } = sheet;
  const firstGuest = headerRow + 1;
  const lastGuest = Math.max(rows.length, firstGuest);
  const col = (letter: string) => `$${letter}$${firstGuest}:$${letter}$${lastGuest}`;

  const wb = new ExcelJS.Workbook();
  // Have Excel recompute the formulas on open, whatever results were cached.
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet(RECEPTION_SHEET_NAME, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: headerRow, topLeftCell: `A${firstGuest}` }],
    pageSetup: {
      orientation: 'portrait',
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  });
  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  rows.forEach((row, i) => {
    row.forEach((v, c) => {
      const cell = ws.getCell(i + 1, c + 1);
      if (v != null) cell.value = v;
      cell.font = FONT;
    });
  });
  const cell = (r: number, c: number) => ws.getCell(r, c);
  const value = (r: number, c: number): SheetCell => rows[r - 1]?.[c - 1] ?? null;
  const formula = (r: number, c: number, f: string) => {
    cell(r, c).value = { formula: f, result: Number(value(r, c) ?? 0) };
  };
  const border = (r: number, c: number, b: Partial<ExcelJS.Borders>) => { cell(r, c).border = b; };

  // Summary header: "Meal Choice" across A1:B1, "Color Code" boxed above the colors.
  // B1 is styled before the merge: once merged, its style is A1's.
  border(1, 1, { left: MEDIUM, bottom: MEDIUM });
  border(1, 2, { bottom: MEDIUM });
  ws.mergeCells(1, 1, 1, 2);
  for (const c of [1, 3]) {
    cell(1, c).font = BOLD;
    cell(1, c).alignment = { horizontal: 'center' };
  }
  border(1, 3, { left: MEDIUM, right: MEDIUM, top: MEDIUM });

  // Meal rows: bold names right-aligned, live counts, colors left-aligned.
  for (let r = s.firstMealRow; r <= s.lastMealRow; r++) {
    const top = r === s.firstMealRow ? MEDIUM : THIN;
    cell(r, 1).font = BOLD;
    cell(r, 1).alignment = { horizontal: 'right' };
    cell(r, 3).alignment = { horizontal: 'left' };
    if (r === s.noMealRow) formula(r, 2, `COUNTBLANK(${col('C')})`);
    else formula(r, 2, `COUNTIF(${col('C')},${countifCriterion(String(value(r, 1) ?? ''))})`);
    border(r, 1, { left: MEDIUM, right: MEDIUM, top, bottom: THIN });
    border(r, 2, { top, bottom: THIN });
    border(r, 3, { left: MEDIUM, right: MEDIUM, top, bottom: r === s.lastMealRow ? MEDIUM : THIN });
  }

  // Vendor meals: bold names, typed counts, the box closed on the right.
  for (let r = s.firstVendorRow; r <= s.lastVendorRow; r++) {
    const bottom = r === s.lastVendorRow ? MEDIUM : THIN;
    cell(r, 1).font = BOLD;
    cell(r, 1).alignment = { horizontal: 'right' };
    border(r, 1, { left: MEDIUM, right: MEDIUM, top: THIN, bottom });
    border(r, 2, { right: MEDIUM, top: THIN, bottom });
  }

  // Total of every count above it.
  cell(s.totalRow, 1).font = BOLD;
  formula(s.totalRow, 2, `SUM(B${s.firstMealRow}:B${s.totalRow - 1})`);
  for (const c of [1, 2]) border(s.totalRow, c, { left: MEDIUM, right: MEDIUM, bottom: MEDIUM });

  // A / B / H counts beside the vendor meals and total.
  const marks: [number, string, string][] = [[s.allergensRow, 'F', 'A'], [s.boostersRow, 'E', 'B'], [s.highChairsRow, 'E', 'H']];
  for (const [r, letter, mark] of marks) {
    cell(r, 3).font = BOLD;
    cell(r, 3).alignment = { horizontal: 'right' };
    formula(r, 4, `COUNTIF(${col(letter)},"${mark}")`);
  }

  // Guest list: bold header over a medium rule, H / B and A centered, Table#
  // right-aligned whether it's a number or a name, Color Code looked up.
  const lookup = `$A$${s.firstMealRow}:$C$${s.lastMealRow}`;
  for (let c = 1; c <= COLUMN_WIDTHS.length; c++) {
    cell(headerRow, c).font = { name: 'Calibri', size: 11, family: 2, bold: true };
    border(headerRow, c, { bottom: MEDIUM });
  }
  for (const c of [5, 6]) cell(headerRow, c).alignment = { horizontal: 'center' };
  for (let r = firstGuest; r <= rows.length; r++) {
    cell(r, 5).alignment = { horizontal: 'center' };
    cell(r, 6).alignment = { horizontal: 'center' };
    if (typeof value(r, 2) === 'string') cell(r, 2).alignment = { horizontal: 'right' };
    cell(r, 7).value = { formula: `IFERROR(VLOOKUP(C${r},${lookup},3,FALSE)&"","")`, result: String(value(r, 7) ?? '') };
  }

  for (const r of [1, s.lastMealRow, s.lastVendorRow, s.totalRow, headerRow]) ws.getRow(r).height = RULED_ROW_HEIGHT;
  return wb;
}

export async function receptionWorkbookBuffer(sheet: ReceptionSheet) {
  return Buffer.from(await buildReceptionWorkbook(sheet).xlsx.writeBuffer());
}
