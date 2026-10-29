'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChildSeatBadge } from '@/components/admin/ChildSeatSelect';
import { TENT_CARD_FORMATS, type TentCardFormat } from '@/lib/tentCardFormats';
import { composeTentContent, tableDisplayName, type TentOptions } from '@/lib/nameTentsPdf';
import { resolveSeatedGuests, UNASSIGNED_TABLE, type SeatingExportInvitation, type SeatingExportTable } from '@/lib/seatingExport';
import { fetchThemeFontBytes } from '@/lib/themeFontBytes';
import type { LabelFontBytes } from '@/lib/mailingLabelsPdf';
import { parseRsvpChoices, type RsvpChoice } from '@/lib/rsvpChoices';
import { buildMealColorMap, mealColorFor } from '@/lib/mealColors';

interface Features { nameTents?: boolean; childSeats?: boolean; dietaryNotes?: boolean }

export default function NameTentsPage() {
  const [tables, setTables] = useState<(SeatingExportTable & { id: string })[]>([]);
  const [invitations, setInvitations] = useState<SeatingExportInvitation[]>([]);
  const [features, setFeatures] = useState<Features>({});
  const [mealChoices, setMealChoices] = useState<RsvpChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [formatCode, setFormatCode] = useState<TentCardFormat['code']>('3328');
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<TentOptions>({
    showTable: true, showChildSeat: false, showAllergies: false, showMeal: false,
    showMealColor: true, showAllergyMark: true, showChildSeatMark: true,
  });
  const [bothSides, setBothSides] = useState(true);
  const [outline, setOutline] = useState(false);
  const [startPosition, setStartPosition] = useState(1);
  const [offsetX, setOffsetX] = useState('0');
  const [offsetY, setOffsetY] = useState('0');
  const fontBytesRef = useRef<LabelFontBytes | null>(null);

  const format = useMemo(() => TENT_CARD_FORMATS.find((f) => f.code === formatCode)!, [formatCode]);

  useEffect(() => {
    (async () => {
      try {
        const [t, i, f, o] = await Promise.all([
          fetch('/api/tables'), fetch('/api/invitations'), fetch('/api/features'), fetch('/api/rsvp-options'),
        ]);
        if (!t.ok || !i.ok) throw new Error('Failed to load seating');
        const tablesData = await t.json();
        setTables(tablesData);
        setInvitations(await i.json());
        setFeatures(f.ok ? await f.json() : {});
        const rsvpOptions: { type: string; choices: string }[] = o.ok ? await o.json() : [];
        setMealChoices(rsvpOptions.filter((x) => x.type === 'meal').flatMap((x) => parseRsvpChoices(x.choices)));
        setSelectedTables(new Set(tablesData.map((x: { name: string }) => x.name)));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const childSeatsOn = features.childSeats !== false;
  const allergiesOn = features.dietaryNotes !== false;
  const effectiveOptions: TentOptions = {
    ...options,
    showChildSeat: options.showChildSeat && childSeatsOn,
    showAllergies: options.showAllergies && allergiesOn,
    showChildSeatMark: options.showChildSeatMark && childSeatsOn,
    showAllergyMark: options.showAllergyMark && allergiesOn,
  };
  const mealColors = useMemo(() => buildMealColorMap(mealChoices), [mealChoices]);
  const coloredMeals = mealChoices.filter((c) => c.color);

  const seated = useMemo(() => resolveSeatedGuests(tables, invitations), [tables, invitations]);
  const unseatedCount = seated.filter((g) => g.table === UNASSIGNED_TABLE).length;
  const printing = seated.filter((g) => g.table !== UNASSIGNED_TABLE && selectedTables.has(g.table));
  // Households still on one shared allergy note: it can't go on any single
  // card, so warn before the couple prints without it.
  // Guests whose meal has no color print with no circle; name the meals so
  // the couple can fix them on RSVP Configuration before printing.
  const uncoloredMeals = [...new Set(
    printing.filter((g) => !mealColorFor(g.meal, mealColors)).map((g) => g.meal.trim() || 'No meal chosen'),
  )];
  const uncoloredGuests = printing.filter((g) => !mealColorFor(g.meal, mealColors)).length;
  const unsplitHouseholds = new Set(
    printing.filter((g) => g.householdDietary && g.invitationId).map((g) => g.invitationId),
  ).size;

  const byTable = useMemo(() => {
    const map = new Map<string, typeof seated>();
    for (const g of seated) {
      if (g.table === UNASSIGNED_TABLE) continue;
      map.set(g.table, [...(map.get(g.table) ?? []), g]);
    }
    return [...map.entries()];
  }, [seated]);

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const parseOffset = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { renderNameTentsPdf } = await import('@/lib/nameTentsPdf');
      if (!fontBytesRef.current) fontBytesRef.current = await fetchThemeFontBytes();
      const bytes = await renderNameTentsPdf({
        format,
        startPosition,
        tents: printing.map((g) => composeTentContent(g, effectiveOptions, mealColors)),
        fonts: fontBytesRef.current,
        bothSides,
        outline,
        offsetXInches: parseOffset(offsetX),
        offsetYInches: parseOffset(offsetY),
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `name-tents-${formatCode}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="p-6"><p className="text-sm text-gray-500">Loading…</p></div>;

  if (features.nameTents === false) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-bold">Print Name Tents</h1>
        <p className="text-sm text-gray-500">
          Name tents are turned off. Turn them on under <Link href="/admin/features" className="text-primary hover:underline">Features</Link>.
        </p>
      </div>
    );
  }

  const checkbox = (checked: boolean, onChange: (v: boolean) => void, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input type="checkbox" className="h-4 w-4 mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  );

  const sheets = Math.ceil((startPosition - 1 + printing.length) / format.labelsPerSheet);

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Print Name Tents</h1>
          <p className="text-sm text-gray-500">
            A PDF of folded tent cards, one per seated guest, with their name and table. Both halves
            are printed so the card reads from either side of the table.
          </p>
        </div>
        <Link href="/admin/seating" className="text-sm text-primary hover:underline">← Back to Seating</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Card sheet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={formatCode}
              onChange={(e) => setFormatCode(e.target.value as TentCardFormat['code'])}
            >
              {TENT_CARD_FORMATS.map((f) => <option key={f.code} value={f.code}>{f.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start at card position</label>
            <Input
              type="number" min={1} max={format.labelsPerSheet} value={startPosition}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setStartPosition(Math.max(1, Math.min(format.labelsPerSheet, n)));
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              1 to {format.labelsPerSheet}, left to right then top to bottom. Use this to finish a partly used sheet.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Nudge right (inches)</label>
              <Input type="number" step="0.02" min={-1} max={1} value={offsetX} onChange={(e) => setOffsetX(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nudge down (inches)</label>
              <Input type="number" step="0.02" min={-1} max={1} value={offsetY} onChange={(e) => setOffsetY(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Print one page on plain paper with outlines on and hold it against a card sheet. If it’s off,
            nudge it (negative values move left or up) and try again before using the real cards.
          </p>
          {checkbox(outline, setOutline, 'Draw card outlines and fold lines', 'For a test print on plain paper. Turn off for the real cards.')}
          {checkbox(bothSides, setBothSides, 'Print on both halves', 'Off prints the front half only.')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>On each card</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-500">The guest’s name is always printed.</p>
          {checkbox(options.showTable, (v) => setOptions({ ...options, showTable: v }), 'Table name', 'A sort prefix like “01. ” is left off.')}
          <p className="text-sm font-medium pt-1">Small print</p>
          {childSeatsOn && checkbox(options.showChildSeat, (v) => setOptions({ ...options, showChildSeat: v }), 'High chair or booster seat')}
          {allergiesOn && checkbox(options.showAllergies, (v) => setOptions({ ...options, showAllergies: v }), 'Allergies', 'Spelled out under the table name. Guests at the table will see it.')}
          {checkbox(options.showMeal, (v) => setOptions({ ...options, showMeal: v }), 'Meal choice')}
          <div className="pt-2">
            <p className="text-sm font-medium">Corner marks for servers</p>
            <p className="text-xs text-gray-500 mb-2">Big enough to read at a glance from standing height, on both halves of the card.</p>
          </div>
          {checkbox(options.showMealColor ?? false, (v) => setOptions({ ...options, showMealColor: v }), 'Meal color circle, bottom right', 'A ½" circle in the color set for each meal on RSVP Configuration.')}
          {options.showMealColor && (
            <div className="ml-6 text-xs text-gray-600 space-y-1">
              {coloredMeals.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {coloredMeals.map((c) => (
                    <span key={c.name} className="inline-flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-full border border-gray-400" style={{ backgroundColor: mealColors.get(c.name.toLowerCase())?.hex }} aria-hidden />
                      {c.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-amber-800">
                  No meal has a color yet. Set them on <Link href="/admin/rsvp-config" className="underline">RSVP Configuration</Link>.
                </p>
              )}
              {coloredMeals.length > 0 && uncoloredGuests > 0 && (
                <p className="text-amber-800">
                  {uncoloredGuests} card{uncoloredGuests === 1 ? '' : 's'} will print with no circle because their meal has no
                  color: {uncoloredMeals.join(', ')}. Set colors on <Link href="/admin/rsvp-config" className="underline">RSVP Configuration</Link>.
                </p>
              )}
            </div>
          )}
          {allergiesOn && checkbox(options.showAllergyMark ?? false, (v) => setOptions({ ...options, showAllergyMark: v }), 'A for allergies, bottom left', 'When the guest has any allergy or dietary restriction of their own.')}
          {childSeatsOn && checkbox(options.showChildSeatMark ?? false, (v) => setOptions({ ...options, showChildSeatMark: v }), 'H or B for a high chair or booster, top right')}
          {(effectiveOptions.showAllergies || effectiveOptions.showAllergyMark) && unsplitHouseholds > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              {unsplitHouseholds} household{unsplitHouseholds === 1 ? ' still has' : 's still have'} one shared allergy
              note that isn’t split per person, so it won’t print or get an A on anyone’s card. Split it
              on <Link href="/admin/rsvps" className="underline">RSVPs</Link> first.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle>Tables</CardTitle>
            <span className="text-sm text-gray-500">{printing.length} card{printing.length === 1 ? '' : 's'}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedTables(new Set(byTable.map(([t]) => t)))}>Select all</Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedTables(new Set())}>Clear selection</Button>
          </div>
          {byTable.length === 0 && <p className="text-sm text-gray-500">Nobody is seated yet.</p>}
          <div className="divide-y border border-gray-200 rounded">
            {byTable.map(([table, guests]) => (
              <label key={table} className="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4 mt-0.5" checked={selectedTables.has(table)} onChange={() => toggleTable(table)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {tableDisplayName(table)} <span className="text-gray-500 font-normal">({guests.length})</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {guests.map((g, i) => (
                      <span key={`${g.guestName}-${i}`}>
                        {i > 0 && ', '}
                        {g.guestName}
                        {childSeatsOn && g.childSeat && <ChildSeatBadge seat={g.childSeat} />}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            ))}
          </div>
          {unseatedCount > 0 && (
            <p className="text-xs text-gray-500">
              {unseatedCount} attending guest{unseatedCount === 1 ? ' isn’t' : 's aren’t'} seated yet and won’t get a card.
            </p>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="sticky bottom-0 bg-gray-50 py-3 -mx-6 px-6 border-t border-gray-200 flex items-center gap-3">
        <Button disabled={printing.length === 0 || generating} onClick={handleGenerate}>
          {generating ? 'Generating…' : `Generate PDF for ${printing.length} card${printing.length === 1 ? '' : 's'}`}
        </Button>
        {printing.length > 0 && <span className="text-sm text-gray-500">{sheets} sheet{sheets === 1 ? '' : 's'}</span>}
      </div>
    </div>
  );
}
