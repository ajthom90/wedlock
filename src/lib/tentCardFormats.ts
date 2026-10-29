// Avery tent card sheet specs. All measurements in inches, describing each
// card UNFOLDED as it sits on the sheet: two panels stacked top/bottom with
// the fold line halfway down. The bottom panel prints upright and the top
// panel upside down, so both read correctly once the card is folded and
// stood on the table.
//
// Field names match AveryFormat so the label grid math (computeLabelPositions)
// is shared. Avery doesn't publish margins for these sheets; the numbers
// below assume the card grid is centred on the page. If a test print on plain
// paper doesn't line up with a real sheet, adjust marginTop / marginLeft here
// (or use the nudge offsets on the Name Tents page).

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
    // Matte white with a metallic gold border, 2" × 3½" folded, 4 per sheet.
    // Shares Avery's 5302 small tent card template.
    code: '3328',
    displayName: 'Avery 3328 — 4 tent cards/sheet (2" × 3½" folded, gold border)',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 1.5,
    marginLeft: 0.75,
    labelWidth: 3.5,
    labelHeight: 4,
    horizontalGap: 0,
    verticalGap: 0,
    cols: 2,
    rows: 2,
    labelsPerSheet: 4,
    panelPaddingX: 0.3,
    panelPaddingY: 0.25,
  },
];
