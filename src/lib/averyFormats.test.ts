import { describe, it, expect } from 'vitest';
import { AVERY_FORMATS, type AveryFormat } from './averyFormats';

describe('AVERY_FORMATS', () => {
  it('contains the four curated formats', () => {
    const codes = AVERY_FORMATS.map((f) => f.code).sort();
    expect(codes).toEqual(['5160', '5161', '5163', 'L7160']);
  });

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: cols * rows equals labelsPerSheet',
    (_code, f: AveryFormat) => {
      expect(f.cols * f.rows).toBe(f.labelsPerSheet);
    },
  );

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: horizontal layout fits on the page',
    (_code, f: AveryFormat) => {
      const totalWidth = f.marginLeft + f.cols * f.labelWidth + (f.cols - 1) * f.horizontalGap;
      // Allow a tiny numerical tolerance for the float arithmetic.
      expect(totalWidth).toBeLessThanOrEqual(f.pageWidth + 0.01);
    },
  );

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: vertical layout fits on the page',
    (_code, f: AveryFormat) => {
      const totalHeight = f.marginTop + f.rows * f.labelHeight + (f.rows - 1) * f.verticalGap;
      expect(totalHeight).toBeLessThanOrEqual(f.pageHeight + 0.01);
    },
  );

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: has a non-empty displayName',
    (_code, f: AveryFormat) => {
      expect(f.displayName.length).toBeGreaterThan(0);
    },
  );
});
