// Avery label format specs. All measurements in inches. A4-paper formats
// (like L7160) use inches-equivalent values for uniformity; the renderer
// converts inches to PDF points at draw time.
//
// Numbers taken from Avery's published specs. If a manual print doesn't
// line up on a real sheet, adjust marginTop / marginLeft here.

export interface AveryFormat {
  code: '5160' | '5161' | '5163' | 'L7160';
  displayName: string;
  paper: 'letter' | 'a4';
  pageWidth: number;          // inches
  pageHeight: number;         // inches
  marginTop: number;          // inches, to top edge of first row
  marginLeft: number;         // inches, to left edge of first column
  labelWidth: number;         // inches
  labelHeight: number;        // inches
  horizontalGap: number;      // inches, between columns
  verticalGap: number;        // inches, between rows
  cols: number;
  rows: number;
  labelsPerSheet: number;     // denormalized cols × rows
}

export const AVERY_FORMATS: AveryFormat[] = [
  {
    code: '5160',
    displayName: 'Avery 5160 — 30 labels/sheet (1" × 2⅝")',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 0.5,
    marginLeft: 0.1875,
    labelWidth: 2.625,
    labelHeight: 1.0,
    horizontalGap: 0.125,
    verticalGap: 0,
    cols: 3,
    rows: 10,
    labelsPerSheet: 30,
  },
  {
    code: '5161',
    displayName: 'Avery 5161 — 20 labels/sheet (1" × 4")',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 0.5,
    marginLeft: 0.15625,
    labelWidth: 4.0,
    labelHeight: 1.0,
    horizontalGap: 0.1875,
    verticalGap: 0,
    cols: 2,
    rows: 10,
    labelsPerSheet: 20,
  },
  {
    code: '5163',
    displayName: 'Avery 5163 — 10 labels/sheet (2" × 4")',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 0.5,
    marginLeft: 0.15625,
    labelWidth: 4.0,
    labelHeight: 2.0,
    horizontalGap: 0.1875,
    verticalGap: 0,
    cols: 2,
    rows: 5,
    labelsPerSheet: 10,
  },
  {
    code: 'L7160',
    displayName: 'Avery L7160 — 21 labels/sheet (A4, 1.5" × 2.5")',
    paper: 'a4',
    pageWidth: 8.267,   // 210 mm
    pageHeight: 11.693, // 297 mm
    marginTop: 0.606,   // 15.4 mm
    marginLeft: 0.28,   // 7.1 mm
    labelWidth: 2.5,    // 63.5 mm
    labelHeight: 1.5,   // 38.1 mm
    horizontalGap: 0.1, // 2.5 mm
    verticalGap: 0,
    cols: 3,
    rows: 7,
    labelsPerSheet: 21,
  },
];
