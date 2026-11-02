import { describe, it, expect } from 'vitest';
import { MARK_COLORS, MEAL_COLORS, buildMealCodeMap, findMarkColor, buildMealColorMap, findMealColor, hexToRgb01, mealCodeFor, mealCodeLabel, mealColorFor } from './mealColors';
import { MEAL_ICONS, MARK_ICONS, findMealIcon, findMarkIcon } from './mealIcons';

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

describe('meal codes (color + icon)', () => {
  const codes = buildMealCodeMap([
    { name: 'Chicken', color: 'Blue', icon: 'Rooster' },
    { name: 'Beef', color: 'red', icon: 'cow' },
    { name: 'Pasta', color: 'Yellow' },
    { name: 'No Meal', icon: 'Star' },
    { name: 'Vendor Meal' },
  ]);

  it('reads the caterer-style code, case-insensitively', () => {
    expect(mealCodeLabel(mealCodeFor(' chicken ', codes))).toBe('Blue Rooster');
    expect(mealCodeLabel(mealCodeFor('Beef', codes))).toBe('Red Cow');
  });

  it('uses whichever half is set, and nothing for a meal with neither', () => {
    expect(mealCodeLabel(mealCodeFor('Pasta', codes))).toBe('Yellow');
    expect(mealCodeLabel(mealCodeFor('No Meal', codes))).toBe('Star');
    expect(mealCodeFor('Vendor Meal', codes)).toBeNull();
    expect(mealCodeLabel(null)).toBe('');
  });
});

describe('MEAL_ICONS', () => {
  it('has unique names, each with at least one path', () => {
    expect(new Set(MEAL_ICONS.map((i) => i.name.toLowerCase())).size).toBe(MEAL_ICONS.length);
    for (const i of MEAL_ICONS) {
      expect(i.paths.length, i.name).toBeGreaterThan(0);
      for (const d of i.paths) expect(d, i.name).toMatch(/^[Mm]/);
    }
  });

  it('includes the icons caterers commonly use', () => {
    for (const name of ['Rooster', 'Cow', 'Wheat', 'Heart', 'Star', 'Fish', 'Pig']) expect(findMealIcon(name)?.name).toBe(name);
    expect(findMealIcon('unicorn')).toBeNull();
  });

  it('keeps the high chair / booster landmarks out of the meal icons', () => {
    expect(MARK_ICONS.map((i) => i.name)).toEqual(['Colosseum', 'Leaning Tower', 'Magic Wand']);
    expect(findMarkIcon('leaning tower')?.name).toBe('Leaning Tower');
    expect(findMealIcon('Colosseum')).toBeNull();
    expect(findMarkIcon('Rooster')).toBeNull();
  });
});

describe('MARK_COLORS', () => {
  it('is the meal palette plus Blaze Orange, which meals can’t use', () => {
    expect(MARK_COLORS.slice(0, MEAL_COLORS.length)).toEqual(MEAL_COLORS);
    expect(findMarkColor('blaze orange')).toEqual({ name: 'Blaze Orange', hex: '#FF6700' });
    expect(findMarkColor('Blue')?.hex).toBe('#1F5FD1');
    expect(findMealColor('Blaze Orange')).toBeNull();
  });
});
