'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  shuttleId: string;
  maxGuests: number;
  initialCount: number;
  seatsLeft: number | null;  // null = unlimited; number = available (includes own existing reservation)
}

export function ShuttleSignupForm({ shuttleId, maxGuests, initialCount, seatsLeft }: Props) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const cap = seatsLeft === null ? maxGuests : Math.min(maxGuests, seatsLeft + initialCount);

  const submit = async (value: number) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/shuttles/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shuttleId, guestCount: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save signup');
        return;
      }
      setCount(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 border border-foreground/20 rounded-md">
        <button
          type="button"
          onClick={() => submit(Math.max(0, count - 1))}
          disabled={saving || count <= 0}
          className="px-3 py-2 text-lg hover:bg-foreground/5 disabled:opacity-40"
          aria-label="Fewer seats"
        >
          −
        </button>
        <span className="px-2 font-medium min-w-[2ch] text-center">{count}</span>
        <button
          type="button"
          onClick={() => submit(Math.min(cap, count + 1))}
          disabled={saving || count >= cap}
          className="px-3 py-2 text-lg hover:bg-foreground/5 disabled:opacity-40"
          aria-label="More seats"
        >
          +
        </button>
      </div>
      <span className="text-sm text-foreground/70">
        {count === 0 ? 'Not signed up' : `${count} seat${count === 1 ? '' : 's'} reserved`}
      </span>
      {saved && <span className="text-sm text-green-600">Saved</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
