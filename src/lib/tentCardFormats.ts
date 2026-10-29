// Avery tent card sheet specs. All measurements in inches, describing each
// card UNFOLDED as it sits on the sheet: two panels stacked top/bottom with
// the fold line halfway down. The bottom panel prints upright and the top
// panel upside down, so both read correctly once the card is folded and
// stood on the table.
//
// Field names match AveryFormat so the label grid math (computeLabelPositions)
// is shared. Measurements come from Avery's own blank template for each
// sheet. If a printer still shifts things, use the nudge offsets on the Name
// Tents page rather than changing these.

export interface TentCardFormat {
  code: '3328';
  displayName: string;
  paper: 'letter';
  pageWidth: number;
  pageHeight: number;
  marginTop: number;          // to top edge of the first row of cards
  marginLeft: number;         // to left edge of the first column
  labelWidth: number;         // unfolded card width (= folded panel width)
  labelHeight: number;        // unfolded card height (= 2 × panel height)
  horizontalGap: number;
  verticalGap: number;
  cols: number;
  rows: number;
  labelsPerSheet: number;     // denormalized cols × rows
  // Keeps text inside the printed border on each panel.
  panelPaddingX: number;
  panelPaddingY: number;
}

export const TENT_CARD_FORMATS: TentCardFormat[] = [
  {
    // Matte white with a metallic gold border, 2" × 3½" folded, 4 per sheet
    // (2 across, 2 down). From Avery's 3328 template: ½" side margins and
    // ½" between columns, 1¼" top and bottom margins and ½" between rows.
    code: '3328',
    displayName: 'Avery 3328 — 4 tent cards/sheet (2" × 3½" folded, gold border)',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 1.25,
    marginLeft: 0.5,
    labelWidth: 3.5,
    labelHeight: 4,
    horizontalGap: 0.5,
    verticalGap: 0.5,
    cols: 2,
    rows: 2,
    labelsPerSheet: 4,
    panelPaddingX: 0.3,
    panelPaddingY: 0.25,
  },
];
