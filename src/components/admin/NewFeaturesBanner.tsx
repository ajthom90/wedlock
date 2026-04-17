'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReleaseChange, ReleaseNote } from '@/lib/releaseNotes';

// Key holds the last version the admin dismissed the banner for. Banner
// re-appears automatically after a deploy that includes a newer version
// with fresh release notes.
const DISMISS_STORAGE_KEY = 'admin-features-banner-dismissed-version';

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

export function NewFeaturesBanner() {
  const [note, setNote] = useState<ReleaseNote | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/release-notes');
        if (!res.ok) return;
        const data = (await res.json()) as { currentVersion: string; notes: ReleaseNote[] };
        setCurrentVersion(data.currentVersion);
        const forCurrent = data.notes.find((n) => n.version === data.currentVersion);
        setNote(forCurrent ?? null);
      } catch { /* silent — banner just stays hidden */ }
      try {
        const seen = localStorage.getItem(DISMISS_STORAGE_KEY);
        setDismissed(!!seen && seen === (note?.version ?? ''));
      } catch { /* storage disabled */ }
      setHydrated(true);
    })();
    // Intentionally empty deps — we want this to run once on mount.
    // Reading note inside setDismissed is a stale closure, but that's OK:
    // the dismissed state is reconciled by the next effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile dismissed flag once we know which version's note we're showing.
  useEffect(() => {
    if (!note) return;
    try {
      const seen = localStorage.getItem(DISMISS_STORAGE_KEY);
      setDismissed(seen === note.version);
    } catch { /* storage disabled — treat as not dismissed */ }
  }, [note]);

  if (!hydrated || !note || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_STORAGE_KEY, note.version); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">
            ✨ What&apos;s new in v{note.version}
          </p>
          <p className="text-xs text-gray-500">Released {note.date}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-sm text-gray-500 hover:text-gray-700"
          aria-label="Dismiss banner"
        >
          ✕
        </button>
      </div>
      <ul className="space-y-2">
        {note.changes.map((c, i) => (
          <li key={i} className="flex gap-2 items-start text-sm">
            <span className={`text-xs uppercase tracking-wide px-2 py-0.5 rounded ${TYPE_CLASSES[c.type]}`}>
              {TYPE_LABELS[c.type]}
            </span>
            <span className="text-gray-800 flex-1">{c.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between pt-1">
        <Link href="/admin/changelog" className="text-sm text-primary hover:underline">
          See all changes →
        </Link>
        {currentVersion && currentVersion !== note.version && (
          <span className="text-xs text-gray-400">Running v{currentVersion}</span>
        )}
      </div>
    </div>
  );
}
