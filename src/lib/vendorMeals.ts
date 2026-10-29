// Meals the caterer plates for vendors (DJ, photographer, planner…), who
// aren't guests on any invitation. The couple keeps any number of them, each
// with a name and a count ("Standard Vendor Meals" 10, "Vegetarian Vendor
// Meal" 1); they're listed on the Reception Seating sheet and added to its
// total. Stored as JSON in the site.vendorMeals setting. Pure.

export interface VendorMeal {
  name: string;
  count: number;
}

export const MAX_VENDOR_MEALS = 20;
export const MAX_VENDOR_MEAL_NAME = 80;
const MAX_COUNT = 9999;

/** Coerce whatever is stored or submitted into a clean list; rows with no name are dropped. */
export function parseVendorMeals(raw: unknown): VendorMeal[] {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  const out: VendorMeal[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { name?: unknown; count?: unknown };
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, MAX_VENDOR_MEAL_NAME) : '';
    if (!name) continue;
    const n = typeof rec.count === 'number' ? rec.count : parseInt(String(rec.count ?? ''), 10);
    const count = Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(0, Math.floor(n))) : 0;
    out.push({ name, count });
    if (out.length === MAX_VENDOR_MEALS) break;
  }
  return out;
}
