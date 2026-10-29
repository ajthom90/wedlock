'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MAX_VENDOR_MEALS, parseVendorMeals } from '@/lib/vendorMeals';

interface Row { key: number; name: string; count: string }

let nextKey = 0;
const toRow = (name: string, count: number | string): Row => ({ key: nextKey++, name, count: String(count) });

// Vendor meals (any number, each a name and a count) + the Reception Seating
// spreadsheet download, on the Seating page. The list is saved to site
// settings with Save, and again before each download so the sheet always
// carries what's on screen.
export function ReceptionSheetCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<'save' | 'download' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.site) setRows(parseVendorMeals(data.site.vendorMeals).map((v) => toRow(v.name, v.count)));
      })
      .catch(() => {});
  }, []);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    const vendorMeals = parseVendorMeals(rows.map((r) => ({ name: r.name, count: r.count })));
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: { vendorMeals } }),
    });
    if (!res.ok) throw new Error('Could not save the vendor meals');
    setRows(vendorMeals.map((v) => toRow(v.name, v.count)));
  };

  const run = async (kind: 'save' | 'download') => {
    setBusy(kind);
    setMessage(null);
    try {
      await save();
      if (kind === 'download') window.location.href = '/api/tables/reception-sheet';
      else setMessage({ ok: true, text: 'Vendor meals saved.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reception Sheet for Vendors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Meal counts with their colors, then every guest’s table, meal, allergies (A) and high chair or booster (H / B).
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Vendor meals</p>
          <p className="text-xs text-gray-500">
            Meals for vendors who aren’t on the guest list. Each one is listed on the sheet with its count and added to the total.
          </p>
          {rows.length === 0 && <p className="text-sm text-gray-500 italic">No vendor meals yet.</p>}
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <Input aria-label="Vendor meal name" placeholder="e.g. Standard Vendor Meals" value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })} />
              <div className="w-24 shrink-0">
                <Input aria-label="Count" type="number" min={0} value={r.count}
                  onChange={(e) => update(r.key, { count: e.target.value })} />
              </div>
              <Button size="sm" variant="outline" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                Remove
              </Button>
            </div>
          ))}
          {rows.length < MAX_VENDOR_MEALS && (
            <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, toRow('', 1)])}>
              Add vendor meal
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => run('save')} disabled={busy !== null}>
            {busy === 'save' ? 'Saving…' : 'Save vendor meals'}
          </Button>
          <Button size="sm" onClick={() => run('download')} disabled={busy !== null}>
            {busy === 'download' ? 'Preparing…' : 'Download Reception Sheet'}
          </Button>
        </div>
        {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
      </CardContent>
    </Card>
  );
}
