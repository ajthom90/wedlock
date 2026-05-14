'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface Correction {
  id: string;
  message: string;
  handledAt: string | null;
  handledNotes: string | null;
  createdAt: string;
  invitation: {
    id: string;
    code: string;
    householdName: string;
  };
}

type Filter = 'open' | 'handled' | 'all';

export default function RsvpCorrectionsPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const fetchCorrections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rsvp-corrections');
      if (res.ok) {
        const data: Correction[] = await res.json();
        setCorrections(data);
        setNoteDrafts(Object.fromEntries(data.map((c) => [c.id, c.handledNotes || ''])));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCorrections(); }, [fetchCorrections]);

  const toggleHandled = async (c: Correction) => {
    setSavingId(c.id);
    try {
      const res = await fetch(`/api/rsvp-corrections/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handled: !c.handledAt, handledNotes: noteDrafts[c.id] ?? '' }),
      });
      if (res.ok) await fetchCorrections();
    } finally {
      setSavingId(null);
    }
  };

  const saveNote = async (c: Correction) => {
    setSavingId(c.id);
    try {
      const res = await fetch(`/api/rsvp-corrections/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handled: !!c.handledAt, handledNotes: noteDrafts[c.id] ?? '' }),
      });
      if (res.ok) await fetchCorrections();
    } finally {
      setSavingId(null);
    }
  };

  const deleteCorrection = async (id: string) => {
    if (!confirm('Delete this correction? This cannot be undone.')) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/rsvp-corrections/${id}`, { method: 'DELETE' });
      if (res.ok) await fetchCorrections();
    } finally {
      setSavingId(null);
    }
  };

  const filtered = corrections.filter((c) => {
    if (filter === 'open') return !c.handledAt;
    if (filter === 'handled') return !!c.handledAt;
    return true;
  });

  const openCount = corrections.filter((c) => !c.handledAt).length;
  const handledCount = corrections.length - openCount;

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading corrections...</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">RSVP Corrections</h1>
        <p className="text-sm text-gray-500 mt-1">
          Typos and data fixes guests flagged from the RSVP form. Update the underlying invitation
          (or wherever else the data lives), then mark the correction as handled.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="cursor-pointer" onClick={() => setFilter('open')}>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{openCount}</p>
            <p className="text-sm text-gray-500">Open</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('handled')}>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-green-600">{handledCount}</p>
            <p className="text-sm text-gray-500">Handled</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('all')}>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{corrections.length}</p>
            <p className="text-sm text-gray-500">All</p>
          </CardContent>
        </Card>
      </div>

      {filter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            Showing: <span className="font-medium capitalize">{filter}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>Clear</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            {filter === 'open' ? 'No open corrections — nice work!' : 'No corrections to show.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{c.invitation.householdName}</CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Code <span className="font-mono">{c.invitation.code}</span> · submitted {new Date(c.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {c.handledAt ? (
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                      Handled {new Date(c.handledAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                      Open
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-gray-50 border rounded-md p-3 whitespace-pre-wrap text-sm">
                  {c.message}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Internal notes (optional)
                  </label>
                  <Textarea
                    rows={2}
                    placeholder="What you changed, who you contacted, etc."
                    value={noteDrafts[c.id] ?? ''}
                    onChange={(e) => setNoteDrafts({ ...noteDrafts, [c.id]: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveNote(c)}
                    disabled={savingId === c.id || (noteDrafts[c.id] ?? '') === (c.handledNotes || '')}
                  >
                    Save notes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteCorrection(c.id)}
                    disabled={savingId === c.id}
                  >
                    Delete
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => toggleHandled(c)}
                    disabled={savingId === c.id}
                  >
                    {c.handledAt ? 'Reopen' : 'Mark handled'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
