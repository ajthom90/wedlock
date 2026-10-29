import { describe, it, expect } from 'vitest';
import { MEAL_COLORS, buildMealColorMap, findMealColor, hexToRgb01, mealColorFor } from './mealColors';

describe('MEAL_COLORS', () => {
  it('has unique names and valid hex values', () => {
    expect(new Set(MEAL_COLORS.map((c) => c.name.toLowerCase())).size).toBe(MEAL_COLORS.length);
    for (const c of MEAL_COLORS) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('keeps every pair of colors visibly apart', () => {
    for (let i = 0; i < MEAL_COLORS.length; i++) {
      for (let j = i + 1; j < MEAL_COLORS.length; j++) {
        const a = hexToRgb01(MEAL_COLORS[i].hex);
        const b = hexToRgb01(MEAL_COLORS[j].hex);
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(dist, `${MEAL_COLORS[i].name} vs ${MEAL_COLORS[j].name}`).toBeGreaterThan(0.25);
      }
    }
  });
});

describe('findMealColor', () => {
  it('matches names case-insensitively', () => {
    expect(findMealColor(' purple ')?.name).toBe('Purple');
    expect(findMealColor('nope')).toBeNull();
    expect(findMealColor(undefined)).toBeNull();
  });
});

describe('hexToRgb01', () => {
  it('splits a hex color into 0..1 channels', () => {
    expect(hexToRgb01('#FF8000')).toEqual([1, 128 / 255, 0]);
  });
});

describe('buildMealColorMap', () => {
  it('maps meal names to colors and skips meals with none', () => {
    const map = buildMealColorMap([
      { name: 'Beef', color: 'Red' },
      { name: "Kid's Meal", color: 'Pink' },
      { name: 'Standard Vendor Meals' },
    ]);
    expect(mealColorFor('beef', map)?.name).toBe('Red');
    expect(mealColorFor(" Kid's Meal ", map)?.name).toBe('Pink');
    expect(mealColorFor('Standard Vendor Meals', map)).toBeNull();
    expect(mealColorFor('', map)).toBeNull();
  });
});
