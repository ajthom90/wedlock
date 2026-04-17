'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReleaseChange, ReleaseNote } from '@/lib/releaseNotes';

const TYPE_LABELS: Record<ReleaseChange['type'], string> = {
  feature: 'New',
  improvement: 'Improved',
  fix: 'Fixed',
};

const TYPE_CLASSES: Record<ReleaseChange['type'], string> = {
  feature: 'bg-emerald-100 text-emerald-800',
  improvement: 'bg-sky-100 text-sky-800',
  fix: 'bg-amber-100 text-amber-800',
};

export default function ChangelogPage() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [currentVersion, setCurrentVersion] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/release-notes');
        if (res.ok) {
          const data = (await res.json()) as { currentVersion: string; notes: ReleaseNote[] };
          setCurrentVersion(data.currentVersion);
          setNotes(data.notes);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-6"><p className="text-gray-500">Loading…</p></div>;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">What&apos;s new</h1>
        <p className="text-sm text-gray-500 mt-1">Currently running v{currentVersion}.</p>
      </div>

      {notes.length === 0 ? (
        <p className="text-gray-500">No release notes yet.</p>
      ) : (
        <div className="space-y-6">
          {notes.map((n) => (
            <Card key={n.version}>
              <CardHeader>
                <div className="flex items-baseline justify-between gap-3">
                  <CardTitle>v{n.version}</CardTitle>
                  <span className="text-sm text-gray-500">{n.date}</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {n.changes.map((c, i) => (
                    <li key={i} className="flex gap-2 items-start text-sm">
                      <span className={`text-xs uppercase tracking-wide px-2 py-0.5 rounded ${TYPE_CLASSES[c.type]}`}>
                        {TYPE_LABELS[c.type]}
                      </span>
                      <span className="text-gray-800 flex-1">{c.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
