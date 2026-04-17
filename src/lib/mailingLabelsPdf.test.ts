import { describe, it, expect } from 'vitest';
import { composeLabelLines, computeLabelPositions } from './mailingLabelsPdf';
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
