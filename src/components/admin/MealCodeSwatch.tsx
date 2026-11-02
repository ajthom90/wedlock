import { findMarkColor } from '@/lib/mealColors';
import { findMealIcon, findMarkIcon, iconViewBox } from '@/lib/mealIcons';

// A meal's mark as it prints on name tents: its icon in its color (dark when
// no color is set), or a dot in its color when it has no icon. Renders
// nothing when the meal has neither. Also previews high chair / booster icons.
export function MealCodeSwatch({ color, icon, size = 12 }: { color?: string; icon?: string; size?: number }) {
  // MARK_COLORS includes every meal color, plus Blaze Orange for corner marks.
  const c = findMarkColor(color);
  const i = findMealIcon(icon) ?? findMarkIcon(icon);
  if (i) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${iconViewBox(i)} ${iconViewBox(i)}`} className="inline-block align-middle shrink-0" aria-hidden>
        {i.paths.map((d, k) => <path key={k} d={d} fill={c?.hex ?? '#1f1f1f'} />)}
      </svg>
    );
  }
  if (!c) return null;
  return <span className="inline-block rounded-full border border-gray-400 align-middle shrink-0" style={{ backgroundColor: c.hex, width: size, height: size }} aria-hidden />;
}
