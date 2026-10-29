'use client';

import { CHILD_SEAT_OPTIONS, childSeatLabel } from '@/lib/guestNeeds';

// Compact "needs a high chair / booster" picker used next to a guest's name
// on the Invitations and RSVPs admin editors.
export function ChildSeatSelect({ value, onChange, className = '' }: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
}) {
  return (
    <select
      className={`text-sm border border-gray-300 rounded-md px-2 py-1 bg-white ${className}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      title="High chair or booster seat"
    >
      <option value="">No child seat</option>
      {CHILD_SEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Small inline badge for lists (Invitations, Seating). Renders nothing when
// the guest needs no seat.
export function ChildSeatBadge({ seat }: { seat: string | null | undefined }) {
  const label = childSeatLabel(seat);
  if (!label) return null;
  return <span className="ml-1 text-xs bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full whitespace-nowrap">{label}</span>;
}
