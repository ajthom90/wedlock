// Writes the Reception Seating grid (receptionSheet.ts) to an .xlsx with
// ExcelJS: bold header rows, column widths, and each "Color Code" cell
// filled in its meal's color so the sheet reads at a glance like the tents.
// Shared by both seating downloads on the admin Seating page.

import ExcelJS from 'exceljs';
import { findMealColor } from './mealColors';
import { RECEPTION_SHEET_NAME, type ReceptionSheet } from './receptionSheet';

const COLUMN_WIDTHS = [30, 12, 28, 40, 8, 6, 12];

/** Black or white text, whichever reads better on the fill. */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? 'FF000000' : 'FFFFFFFF';
}

export function buildReceptionWorkbook(sheet: ReceptionSheet): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(RECEPTION_SHEET_NAME);
  ws.addRows(sheet.rows);
  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(sheet.headerRow).font = { bold: true };

  // Color names sit in column C of the meal rows above the header and in
  // column G of each guest row.
  const paint = (cell: ExcelJS.Cell) => {
    const color = findMealColor(cell.value);
    if (!color) return;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.hex.slice(1).toUpperCase()}` } };
    cell.font = { ...cell.font, color: { argb: textOn(color.hex) } };
  };
  for (let r = 2; r < sheet.headerRow; r++) paint(ws.getCell(r, 3));
  for (let r = sheet.headerRow + 1; r <= sheet.rows.length; r++) paint(ws.getCell(r, 7));
  return wb;
}

export async function receptionWorkbookBuffer(sheet: ReceptionSheet) {
  return Buffer.from(await buildReceptionWorkbook(sheet).xlsx.writeBuffer());
}
