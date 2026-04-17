'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AVERY_FORMATS, type AveryFormat } from '@/lib/averyFormats';
import { composeLabelLines, type LabelSource } from '@/lib/mailingLabelsPdf';

interface InvitationForLabels {
  id: string;
  householdName: string;
  mailingAddress1: string | null;
  mailingAddress2: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  address: string | null;
  response: { attending: string } | null;
}

// Returns true if this invitation has anything we can turn into a label.
// At minimum we need a household name AND either a structured line 1 or a
// legacy free-text address.
function hasAddress(inv: InvitationForLabels): boolean {
  if (!inv.householdName.trim()) return false;
  if (inv.mailingAddress1?.trim()) return true;
  if (inv.address?.trim()) return true;
  return false;
}

export default function MailingLabelsPage() {
  const [invitations, setInvitations] = useState<InvitationForLabels[]>([]);
  const [loading, setLoading] = useState(true);
  const [formatCode, setFormatCode] = useState<AveryFormat['code']>('5160');
  const [startPosition, setStartPosition] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const format = useMemo(
    () => AVERY_FORMATS.find((f) => f.code === formatCode)!,
    [formatCode],
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/invitations');
        if (!res.ok) throw new Error('Failed to load invitations');
        const data = (await res.json()) as InvitationForLabels[];
        // Sort alphabetically by household name.
        data.sort((a, b) => a.householdName.localeCompare(b.householdName));
        setInvitations(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Clamp startPosition whenever format changes — if the admin had position 25
  // on 5160 (30/sheet) and switches to 5163 (10/sheet), clamp to 10.
  useEffect(() => {
    setStartPosition((p) => Math.min(p, format.labelsPerSheet));
  }, [format]);

  const selectAllWithAddress = () => {
    setSelectedIds(new Set(invitations.filter(hasAddress).map((i) => i.id)));
  };
  const selectAttending = () => {
    setSelectedIds(new Set(
      invitations.filter((i) => hasAddress(i) && i.response?.attending === 'yes').map((i) => i.id),
    ));
  };
  const selectPending = () => {
    setSelectedIds(new Set(
      invitations.filter((i) => hasAddress(i) && !i.response).map((i) => i.id),
    ));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Dynamic import so pdf-lib isn't pulled into any page that doesn't
      // actually use it.
      const { renderLabelsPdf } = await import('@/lib/mailingLabelsPdf');
      const selected = invitations.filter((i) => selectedIds.has(i.id));
      const labels = selected.map((inv) => ({
        lines: composeLabelLines(inv as LabelSource),
      }));
      const bytes = await renderLabelsPdf({ format, startPosition, labels });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `mailing-labels-${formatCode}-${today}.pdf`;
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

  const canGenerate = selectedIds.size > 0
    && startPosition >= 1
    && startPosition <= format.labelsPerSheet;

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Print Mailing Labels</h1>
          <p className="text-sm text-gray-500">
            Generate a PDF of Avery-format mailing labels from the invitations&apos; addresses.
            Pick a format and which invitations to include, then print the PDF onto a real sheet.
          </p>
        </div>
        <Link href="/admin/invitations" className="text-sm text-primary hover:underline">
          ← Back to Invitations
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Label sheet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={formatCode}
              onChange={(e) => setFormatCode(e.target.value as AveryFormat['code'])}
            >
              {AVERY_FORMATS.map((f) => (
                <option key={f.code} value={f.code}>{f.displayName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start at label position</label>
            <Input
              type="number"
              min={1}
              max={format.labelsPerSheet}
              value={startPosition}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setStartPosition(Math.max(1, Math.min(format.labelsPerSheet, n)));
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              1 to {format.labelsPerSheet}. Use this to reuse a partially-used sheet — earlier positions will be left blank on the first page.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle>Invitations</CardTitle>
            <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Button size="sm" variant="outline" onClick={selectAllWithAddress}>Select all with address</Button>
            <Button size="sm" variant="outline" onClick={selectAttending}>Select attending</Button>
            <Button size="sm" variant="outline" onClick={selectPending}>Select pending</Button>
            <Button size="sm" variant="outline" onClick={clearSelection}>Clear selection</Button>
          </div>

          <div className="divide-y border border-gray-200 rounded">
            {invitations.map((inv) => {
              const canInclude = hasAddress(inv);
              const lines = canInclude ? composeLabelLines(inv as LabelSource) : [];
              const previewAddress = lines.slice(1).join(' · ');
              const status = inv.response?.attending === 'yes'
                ? { text: 'attending', className: 'bg-emerald-100 text-emerald-800' }
                : inv.response?.attending === 'no'
                ? { text: 'declined', className: 'bg-gray-100 text-gray-600' }
                : { text: 'pending', className: 'bg-amber-100 text-amber-800' };
              return (
                <label
                  key={inv.id}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${canInclude ? 'cursor-pointer' : 'opacity-60'}`}
                >
                  <input
                    type="checkbox"
                    disabled={!canInclude}
                    checked={selectedIds.has(inv.id)}
                    onChange={() => toggleRow(inv.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{inv.householdName}</div>
                    {canInclude
                      ? <div className="text-xs text-gray-500 truncate">{previewAddress}</div>
                      : <div className="text-xs italic text-gray-400">no address on file</div>
                    }
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${status.className}`}>{status.text}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="sticky bottom-0 bg-gray-50 py-3 -mx-6 px-6 border-t border-gray-200 flex items-center gap-3">
        <Button disabled={!canGenerate || generating} onClick={handleGenerate}>
          {generating ? 'Generating…' : `Generate PDF for ${selectedIds.size} label${selectedIds.size === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
