// Named colors a meal choice can carry, so servers can tell a guest's meal
// from a colored circle on their name tent without reading. Stored on each
// meal choice by name (e.g. "Red"); the RGB values here are what prints.
// They're picked to stay distinct from each other on an inkjet, including
// Red vs Pink vs Purple, which couples commonly use side by side.
//
// A meal can also carry an icon (see mealIcons.ts); color and icon together
// make its code, e.g. "Blue Rooster".
import { findMealIcon, type MealIcon } from './mealIcons';

export interface MealColor {
  name: string;
  hex: string;
}

export const MEAL_COLORS: MealColor[] = [
  { name: 'Red', hex: '#D62828' },
  { name: 'Orange', hex: '#F77F00' },
  { name: 'Yellow', hex: '#F5C800' },
  { name: 'Green', hex: '#2E9E44' },
  { name: 'Teal', hex: '#0E9594' },
  { name: 'Blue', hex: '#1F5FD1' },
  { name: 'Purple', hex: '#7B2CBF' },
  { name: 'Pink', hex: '#F27BB5' },
  { name: 'Brown', hex: '#8B5A2B' },
  { name: 'Gray', hex: '#8C8C8C' },
  { name: 'Black', hex: '#111111' },
];

/** The palette entry for a stored color name, case-insensitive; null if unknown. */
export function findMealColor(name: unknown): MealColor | null {
  if (typeof name !== 'string') return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return MEAL_COLORS.find((c) => c.name.toLowerCase() === key) ?? null;
}

/** '#RRGGBB' → [r, g, b] in 0..1, for pdf-lib's rgb(). */
export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Meal name → palette color for every meal choice that has one. Keys are
 * trimmed and lower-cased so a guest's stored meal matches regardless of case.
 */
export function buildMealColorMap(choices: { name: string; color?: string }[]): Map<string, MealColor> {
  const map = new Map<string, MealColor>();
  for (const c of choices) {
    const color = findMealColor(c.color);
    const key = c.name.trim().toLowerCase();
    if (color && key) map.set(key, color);
  }
  return map;
}

export function mealColorFor(meal: string, map: Map<string, MealColor>): MealColor | null {
  return map.get(meal.trim().toLowerCase()) ?? null;
}

/** A meal's color and icon; either may be missing, never both (see buildMealCodeMap). */
export interface MealCode {
  color: MealColor | null;
  icon: MealIcon | null;
}

/**
 * Meal name → color and icon for every meal choice that has either. Keys are
 * trimmed and lower-cased so a guest's stored meal matches regardless of case.
 */
export function buildMealCodeMap(choices: { name: string; color?: string; icon?: string }[]): Map<string, MealCode> {
  const map = new Map<string, MealCode>();
  for (const c of choices) {
    const color = findMealColor(c.color);
    const icon = findMealIcon(c.icon);
    const key = c.name.trim().toLowerCase();
    if ((color || icon) && key) map.set(key, { color, icon });
  }
  return map;
}

export function mealCodeFor(meal: string, map: Map<string, MealCode>): MealCode | null {
  return map.get(meal.trim().toLowerCase()) ?? null;
}

/** "Blue Rooster", or just "Blue" / "Rooster" when only one is set; '' for none. */
export function mealCodeLabel(code: MealCode | null): string {
  if (!code) return '';
  return [code.color?.name, code.icon?.name].filter(Boolean).join(' ');
}
