'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Vendor meal counts + the Reception Seating spreadsheet download, on the
// Seating page. The counts are saved to site settings before each download so
// the sheet always carries what's in the boxes.
export function ReceptionSheetCard() {
  const [standard, setStandard] = useState('0');
  const [vegetarian, setVegetarian] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.site) return;
        setStandard(String(data.site.vendorMealsStandard ?? 0));
        setVegetarian(String(data.site.vendorMealsVegetarian ?? 0));
      })
      .catch(() => {});
  }, []);

  const count = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: { vendorMealsStandard: count(standard), vendorMealsVegetarian: count(vegetarian) } }),
      });
      if (!res.ok) throw new Error('Could not save the vendor meal counts');
      window.location.href = '/api/tables/reception-sheet';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reception Sheet for Vendors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">
          Meal counts with their colors, then every guest’s table, meal, allergies (A) and high chair or booster (H / B).
          Vendor meals are added to the total.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Input id="vendor-meals-standard" label="Standard vendor meals" type="number" min={0} value={standard}
              onChange={(e) => setStandard(e.target.value)} />
          </div>
          <div className="w-44">
            <Input id="vendor-meals-vegetarian" label="Vegetarian vendor meals" type="number" min={0} value={vegetarian}
              onChange={(e) => setVegetarian(e.target.value)} />
          </div>
          <Button size="sm" onClick={download} disabled={busy}>
            {busy ? 'Preparing…' : 'Download Reception Sheet'}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
