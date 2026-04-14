'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function EventsAccessForm() {
  const router = useRouter();
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setSubmitting(true);
    setCodeError('');
    try {
      const res = await fetch(`/api/events?code=${encodeURIComponent(codeInput.trim())}`);
      if (!res.ok) {
        setCodeError('Invalid invitation code. Please try again.');
        return;
      }
      // Cookie is set server-side by /api/events; refresh to pick up wedding-party events.
      router.refresh();
    } catch {
      setCodeError('Could not verify code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mb-10 p-4 border border-foreground/10 rounded-lg bg-background">
      <p className="text-sm text-foreground/70 mb-3">Enter your invitation code to see all events</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Invitation code"
          className="flex-1 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? '...' : 'Submit'}
        </button>
      </form>
      {codeError && <p className="text-sm text-red-500 mt-2">{codeError}</p>}
    </div>
  );
}
