import { describe, it, expect } from 'vitest';
import { MAX_VENDOR_MEALS, parseVendorMeals } from './vendorMeals';

describe('parseVendorMeals', () => {
  it('reads stored JSON and keeps the order', () => {
    expect(parseVendorMeals('[{"name":"Standard Vendor Meals","count":10},{"name":"Vegetarian Vendor Meal","count":1}]')).toEqual([
      { name: 'Standard Vendor Meals', count: 10 },
      { name: 'Vegetarian Vendor Meal', count: 1 },
    ]);
  });

  it('trims names, drops nameless rows and cleans counts', () => {
    expect(parseVendorMeals([
      { name: '  DJ ', count: '3' },
      { name: '', count: 5 },
      { name: 'Crew', count: -1 },
      { name: 'Band', count: 2.7 },
      { name: 'Photo' },
      null,
      'x',
    ])).toEqual([
      { name: 'DJ', count: 3 },
      { name: 'Crew', count: 0 },
      { name: 'Band', count: 2 },
      { name: 'Photo', count: 0 },
    ]);
  });

  it('returns nothing for junk and caps the list', () => {
    expect(parseVendorMeals('not json')).toEqual([]);
    expect(parseVendorMeals({ name: 'x' })).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `V${i}`, count: 1 }));
    expect(parseVendorMeals(many)).toHaveLength(MAX_VENDOR_MEALS);
  });
});
