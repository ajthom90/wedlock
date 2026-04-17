import type { AveryFormat } from './averyFormats';

// Minimal invitation shape the label composer needs. Matches the subset of
// fields Prisma returns on the admin /api/invitations endpoint.
export interface LabelSource {
  householdName: string;
  mailingAddress1: string | null;
  mailingAddress2: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  address: string | null;  // legacy pre-2.9 free-text fallback
}

// Produces the 2–4 lines of text that go on a single label.
// Household always line 1. Prefer structured mailing fields; fall back to
// the legacy `address` text as a single line if mailingAddress1 is empty.
// Address line 2 is only emitted when non-empty. City/state/zip joined with
// a comma between city and state and a space before the zip; each component
// optional so "IL 62704" and "Springfield" both render cleanly.
export function composeLabelLines(src: LabelSource): string[] {
  const lines: string[] = [];
  const hh = src.householdName.trim();
  if (hh) lines.push(hh);

  const a1 = src.mailingAddress1?.trim();
  if (a1) {
    lines.push(a1);
    const a2 = src.mailingAddress2?.trim();
    if (a2) lines.push(a2);
  } else if (src.address?.trim()) {
    lines.push(src.address.trim());
  }

  const city = src.mailingCity?.trim();
  const state = src.mailingState?.trim();
  const zip = src.mailingPostalCode?.trim();
  const cityState = [city, state].filter(Boolean).join(', ');
  const cityStateZip = [cityState, zip].filter(Boolean).join(' ');
  if (cityStateZip) lines.push(cityStateZip);

  return lines;
}

export interface LabelPosition {
  pageIndex: number;
  xInches: number;           // left edge of the label on its page
  yInchesFromTop: number;    // top edge of the label, measured from the page top
}

// Given a format + starting slot + number of labels, compute where each
// label lands. Pure math — no pdf-lib involved. The renderer in Task 4
// converts inches to PDF points and draws inside each box.
export function computeLabelPositions(args: {
  format: AveryFormat;
  startPosition: number;    // 1-indexed; 1 = first slot on the first page
  labelCount: number;
}): LabelPosition[] {
  const { format, startPosition, labelCount } = args;
  const positions: LabelPosition[] = [];
  for (let i = 0; i < labelCount; i++) {
    const gridIndex = (startPosition - 1) + i;
    const pageIndex = Math.floor(gridIndex / format.labelsPerSheet);
    const slotInPage = gridIndex % format.labelsPerSheet;
    const col = slotInPage % format.cols;
    const row = Math.floor(slotInPage / format.cols);
    positions.push({
      pageIndex,
      xInches: format.marginLeft + col * (format.labelWidth + format.horizontalGap),
      yInchesFromTop: format.marginTop + row * (format.labelHeight + format.verticalGap),
    });
  }
  return positions;
}
