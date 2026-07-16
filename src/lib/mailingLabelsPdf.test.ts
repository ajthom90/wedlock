import { describe, it, expect } from 'vitest';
import { composeLabelLines, composeCodeLabelLines, computeLabelPositions } from './mailingLabelsPdf';
import { AVERY_FORMATS } from './averyFormats';

const format5160 = AVERY_FORMATS.find((f) => f.code === '5160')!;

describe('composeLabelLines', () => {
  it('includes all 4 lines when every field is populated', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: '123 Main St',
      mailingAddress2: 'Apt 2',
      mailingCity: 'Springfield',
      mailingState: 'IL',
      mailingPostalCode: '62704',
      address: null,
    })).toEqual([
      'The Smiths',
      '123 Main St',
      'Apt 2',
      'Springfield, IL 62704',
    ]);
  });

  it('omits address line 2 when empty', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: '123 Main St',
      mailingAddress2: null,
      mailingCity: 'Springfield',
      mailingState: 'IL',
      mailingPostalCode: '62704',
      address: null,
    })).toEqual([
      'The Smiths',
      '123 Main St',
      'Springfield, IL 62704',
    ]);
  });

  it('falls back to legacy address field when mailingAddress1 is empty', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: null,
      mailingAddress2: null,
      mailingCity: null,
      mailingState: null,
      mailingPostalCode: null,
      address: '123 Old St, Springfield, IL 62704',
    })).toEqual([
      'The Smiths',
      '123 Old St, Springfield, IL 62704',
    ]);
  });

  it('joins partial city/state/zip sensibly', () => {
    // City only — no comma trail.
    expect(composeLabelLines({
      householdName: 'A',
      mailingAddress1: '1 A St',
      mailingAddress2: null,
      mailingCity: 'Springfield',
      mailingState: null,
      mailingPostalCode: null,
      address: null,
    })).toEqual(['A', '1 A St', 'Springfield']);

    // State + zip only — no leading comma.
    expect(composeLabelLines({
      householdName: 'A',
      mailingAddress1: '1 A St',
      mailingAddress2: null,
      mailingCity: null,
      mailingState: 'IL',
      mailingPostalCode: '62704',
      address: null,
    })).toEqual(['A', '1 A St', 'IL 62704']);
  });

  it('returns only the household name when there is no address data at all', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: null,
      mailingAddress2: null,
      mailingCity: null,
      mailingState: null,
      mailingPostalCode: null,
      address: null,
    })).toEqual(['The Smiths']);
  });

  it('trims whitespace on all components', () => {
    expect(composeLabelLines({
      householdName: '  The Smiths  ',
      mailingAddress1: '  123 Main St  ',
      mailingAddress2: null,
      mailingCity: '  Springfield  ',
      mailingState: '  IL  ',
      mailingPostalCode: '  62704  ',
      address: null,
    })).toEqual([
      'The Smiths',
      '123 Main St',
      'Springfield, IL 62704',
    ]);
  });
});

describe('computeLabelPositions', () => {
  it('places the first label at the top-left of the first page for startPosition=1', () => {
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 1,
      labelCount: 1,
    });
    expect(positions).toHaveLength(1);
    expect(positions[0].pageIndex).toBe(0);
    // Top of first row = marginTop from top; x = marginLeft from left.
    expect(positions[0].xInches).toBeCloseTo(format5160.marginLeft);
    expect(positions[0].yInchesFromTop).toBeCloseTo(format5160.marginTop);
  });

  it('uses startPosition to skip the first N-1 slots', () => {
    // Slot 13 of 5160 (3 cols × 10 rows) = row 4 (0-indexed), col 0.
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 13,
      labelCount: 1,
    });
    expect(positions).toHaveLength(1);
    expect(positions[0].pageIndex).toBe(0);
    const expectedY = format5160.marginTop + 4 * (format5160.labelHeight + format5160.verticalGap);
    expect(positions[0].yInchesFromTop).toBeCloseTo(expectedY);
  });

  it('starts a new page when slots run out', () => {
    // 5160 has 30 slots per sheet. Start at 1, want 31 labels → page 1 gets labels 1-30, page 2 gets label 31.
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 1,
      labelCount: 31,
    });
    expect(positions).toHaveLength(31);
    expect(positions[29].pageIndex).toBe(0);
    expect(positions[30].pageIndex).toBe(1);
    // First slot on page 2 is back at top-left.
    expect(positions[30].xInches).toBeCloseTo(format5160.marginLeft);
    expect(positions[30].yInchesFromTop).toBeCloseTo(format5160.marginTop);
  });

  it('returns empty array for zero labels', () => {
    expect(computeLabelPositions({
      format: format5160,
      startPosition: 1,
      labelCount: 0,
    })).toEqual([]);
  });

  it('handles startPosition > 1 crossing a page boundary correctly', () => {
    // 5160: 30 slots. Start at 25, want 10 labels → 6 on page 1 (slots 25-30), 4 on page 2 (slots 1-4).
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 25,
      labelCount: 10,
    });
    expect(positions).toHaveLength(10);
    expect(positions[5].pageIndex).toBe(0);  // slot 30
    expect(positions[6].pageIndex).toBe(1);  // slot 1 of page 2
    expect(positions[6].xInches).toBeCloseTo(format5160.marginLeft);
    expect(positions[6].yInchesFromTop).toBeCloseTo(format5160.marginTop);
  });
});

import { renderLabelsPdf } from './mailingLabelsPdf';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';

// pdf-lib writes compressed object streams, so font names aren't greppable in
// the raw bytes — read the first page's font resources from the parsed PDF.
async function pageBaseFonts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const resources = doc.getPage(0).node.Resources();
  const fontDict = resources?.lookup(PDFName.of('Font'), PDFDict);
  if (!fontDict) return [];
  return fontDict.entries().map(([, value]) => {
    const font = doc.context.lookup(value, PDFDict);
    return font?.lookup(PDFName.of('BaseFont'))?.toString() ?? '';
  });
}

describe('renderLabelsPdf', () => {
  it('returns a valid PDF buffer (starts with %PDF)', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: ['The Smiths', '123 Main St', 'Springfield, IL 62704'] }],
    });
    expect(bytes.byteLength).toBeGreaterThan(0);
    const header = new TextDecoder().decode(bytes.slice(0, 4));
    expect(header).toBe('%PDF');
  });

  it('creates one page for a small label set that fits on one sheet', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: Array.from({ length: 5 }, (_, i) => ({ lines: [`Row ${i}`] })),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('creates multiple pages when labels overflow a single sheet', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: Array.from({ length: 40 }, (_, i) => ({ lines: [`Row ${i}`] })),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('produces a page of the expected size for the given format', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: ['Solo'] }],
    });
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(0);
    // pdf-lib uses points (1 inch = 72 points). 8.5 × 11 inch → 612 × 792 points.
    expect(page.getWidth()).toBeCloseTo(format5160.pageWidth * 72);
    expect(page.getHeight()).toBeCloseTo(format5160.pageHeight * 72);
  });

  it('startPosition=5 places labels starting at slot 5 on the first page', async () => {
    // 5 empty slots + 3 labels → still all on page 1, page count still 1.
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 5,
      labels: [
        { lines: ['A'] }, { lines: ['B'] }, { lines: ['C'] },
      ],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe('composeCodeLabelLines', () => {
  it('returns heading name, a code line with only the number bold, and the keep-safe note', () => {
    expect(composeCodeLabelLines({ householdName: 'The Smiths', code: '483920' })).toEqual([
      { runs: [{ text: 'The Smiths' }], font: 'heading' },
      { runs: [{ text: 'RSVP code: ' }, { text: '483920', bold: true }], scale: 1.4 },
      { runs: [{ text: 'Please do not lose this code' }], scale: 0.85 },
    ]);
  });

  it('trims whitespace and omits an empty household name', () => {
    expect(composeCodeLabelLines({ householdName: '   ', code: ' 483920 ' })).toEqual([
      { runs: [{ text: 'RSVP code: ' }, { text: '483920', bold: true }], scale: 1.4 },
      { runs: [{ text: 'Please do not lose this code' }], scale: 0.85 },
    ]);
  });
});

describe('renderLabelsPdf with styled lines', () => {
  it('uses Helvetica-Bold for bold runs when no theme fonts are provided', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: composeCodeLabelLines({ householdName: 'The Smiths', code: '483920' }) }],
    });
    const header = new TextDecoder().decode(bytes.slice(0, 4));
    expect(header).toBe('%PDF');
    const fonts = await pageBaseFonts(bytes);
    expect(fonts).toContain('/Helvetica');
    expect(fonts).toContain('/Helvetica-Bold');
  });

  it('fits all three code-label lines onto a 1-inch 5160 label (height-aware shrink)', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{
        lines: composeCodeLabelLines({
          householdName: 'A very long household name that will need shrinking to fit',
          code: '483920483920483920',
        }),
      }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('still renders plain string lines in regular Helvetica only', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: ['The Smiths', '123 Main St'] }],
    });
    const fonts = await pageBaseFonts(bytes);
    expect(fonts).toContain('/Helvetica');
    // Bold is only pulled onto a page by a bold run.
    expect(fonts).not.toContain('/Helvetica-Bold');
  });

  it('truncates the LAST run with an ellipsis, preserving the prefix run', async () => {
    // A code so long it can't fit at the 7pt floor — the "RSVP code: " prefix
    // must survive; only the number gets chopped. Rendering must not throw.
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{
        lines: [{
          runs: [{ text: 'RSVP code: ' }, { text: '9'.repeat(300), bold: true }],
          scale: 1.4,
        }],
      }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
