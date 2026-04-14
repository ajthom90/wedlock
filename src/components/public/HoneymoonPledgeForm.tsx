'use client';

import { useState } from 'react';

interface Props {
  itemId: string;
  itemName: string;
}

export function HoneymoonPledgeForm({ itemId, itemName }: Props) {
  const [open, setOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setGuestName('');
    setAmount('');
    setMessage('');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!guestName.trim() || !(n > 0)) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/honeymoon/pledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          guestName: guestName.trim(),
          amount: n,
          message: message.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not record pledge');
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm text-center">
        <p className="font-medium">Thank you!</p>
        <p className="text-foreground/70">
          Your pledge toward <em>{itemName}</em> is noted. The couple will reach out with details on how to complete it.
        </p>
        <button
          type="button"
          onClick={() => { setSubmitted(false); reset(); }}
          className="mt-2 text-primary hover:underline"
        >
          Pledge again
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-white text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Contribute
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 border border-foreground/10 rounded-md p-4">
      <div>
        <label className="block text-sm font-medium mb-1">Your name</label>
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Amount ($)</label>
        <input
          type="number"
          min={1}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Message (optional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
          placeholder="A note for the couple..."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => { setOpen(false); reset(); }}
          className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          disabled={submitting || !guestName.trim() || !(parseFloat(amount) > 0)}
        >
          {submitting ? 'Sending...' : 'Pledge'}
        </button>
      </div>
    </form>
  );
}
