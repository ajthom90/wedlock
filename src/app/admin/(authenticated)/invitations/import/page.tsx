'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { NormalizedRow, ParsedRow } from '@/lib/invitationImport';

type DuplicateRow = ParsedRow & { matchedExisting: boolean; matchedInSheet: boolean };
type ErrorRow = ParsedRow & { errors: string[] };

type PreviewResponse = {
  totalRows: number;
  existingInvitationCount: number;
  ready: ParsedRow[];
  duplicate: DuplicateRow[];
  error: ErrorRow[];
};

// An EditableRow is a ParsedRow that carries a client-local id so inline
// edits and per-row deletions don't mutate rowNumber (which we still need
// for the final failures report), plus UI state (expanded) so the card list
// can remember whether each row is showing its detail form.
type EditableRow = ParsedRow & {
  clientId: string;
  bucket: 'ready' | 'duplicate' | 'error';
  duplicateMeta?: { matchedExisting: boolean; matchedInSheet: boolean };
  expanded: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Client-side mirror of validateRow so the card list can re-bucket as the
// admin edits. MUST stay in sync with src/lib/invitationImport.ts validateRow.
function clientValidate(n: NormalizedRow): string[] {
  const errors: string[] = [];
  if (!n.householdName.trim()) errors.push('Household name is required');
  if (n.email && !EMAIL_RE.test(n.email)) errors.push('Email is not a valid email address');
  if (n.contactEmail && !EMAIL_RE.test(n.contactEmail)) errors.push('Contact email is not a valid email address');
  if (!Number.isInteger(n.plusOnesAllowed) || n.plusOnesAllowed < 0) errors.push('Plus-Ones Allowed must be 0 or a positive whole number');
  return errors;
}

// Builds the collapsed-row title + subtitle + badge from a row's current
// normalized values. Used by the card's header whether the card is
// collapsed or expanded (expanded still shows the badge for at-a-glance
// bucket context).
function summarizeRow(r: EditableRow): { title: string; subtitle: string; badge?: string; badgeClass: string } {
  const name = r.normalized.householdName.trim() || '(missing household name)';
  const guestCount = r.normalized.guestNames.length;
  const pluses = r.normalized.plusOnesAllowed;
  const cityState = [r.normalized.mailingCity, r.normalized.mailingState].filter(Boolean).join(', ');
  const parts = [
    guestCount === 0 ? 'no named guests' : `${guestCount} guest${guestCount === 1 ? '' : 's'}`,
    pluses > 0 ? `+${pluses} plus-one${pluses === 1 ? '' : 's'}` : null,
    cityState || null,
  ].filter(Boolean) as string[];
  const subtitle = parts.join(' · ');
  if (r.bucket === 'error') {
    const errs = clientValidate(r.normalized);
    return { title: name, subtitle, badge: `${errs.length} error${errs.length === 1 ? '' : 's'}`, badgeClass: 'bg-red-100 text-red-800' };
  }
  if (r.bucket === 'duplicate') {
    return { title: name, subtitle, badge: 'Possible duplicate', badgeClass: 'bg-sky-100 text-sky-800' };
  }
  return { title: name, subtitle, badge: 'Ready', badgeClass: 'bg-emerald-100 text-emerald-800' };
}

export default function InvitationImportPage() {
  const [existingCount, setExistingCount] = useState(0);
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [committedCount, setCommittedCount] = useState(0);
  const [totalToCommit, setTotalToCommit] = useState(0);
  const [failures, setFailures] = useState<Array<{ rowNumber: number; householdName: string; error: string }>>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const readyCount = useMemo(() => rows?.filter((r) => r.bucket === 'ready').length ?? 0, [rows]);
  const duplicateCount = useMemo(() => rows?.filter((r) => r.bucket === 'duplicate').length ?? 0, [rows]);
  const errorCount = useMemo(() => rows?.filter((r) => r.bucket === 'error').length ?? 0, [rows]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/invitations/import/preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
        return;
      }
      const preview = data as PreviewResponse;
      setExistingCount(preview.existingInvitationCount);
      // Error rows auto-expand so the admin lands on the rows that need
      // attention without extra clicks. Duplicates and ready rows stay
      // collapsed — the admin can expand them manually if they want to edit.
      const toEditable = (r: ParsedRow, bucket: EditableRow['bucket'], meta?: EditableRow['duplicateMeta']): EditableRow => ({
        ...r,
        clientId: `${r.rowNumber}-${Math.random().toString(36).slice(2, 8)}`,
        bucket,
        duplicateMeta: meta,
        expanded: bucket === 'error',
      });
      setRows([
        ...preview.error.map((r) => toEditable(r, 'error')),
        ...preview.duplicate.map((r) => toEditable(r, 'duplicate', { matchedExisting: r.matchedExisting, matchedInSheet: r.matchedInSheet })),
        ...preview.ready.map((r) => toEditable(r, 'ready')),
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const updateRow = (clientId: string, patch: Partial<NormalizedRow>) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => {
        if (r.clientId !== clientId) return r;
        const normalized = { ...r.normalized, ...patch };
        const errors = clientValidate(normalized);
        // After edit, re-bucket: error if any validation errors; otherwise
        // keep prior duplicate flag (can't re-check duplicates without re-hitting
        // the server — a small UX honesty loss we accept for V1).
        const bucket: EditableRow['bucket'] = errors.length > 0 ? 'error' : (r.duplicateMeta ? 'duplicate' : 'ready');
        return { ...r, normalized, bucket };
      });
    });
  };

  const toggleExpanded = (clientId: string) => {
    setRows((prev) => prev?.map((r) => r.clientId === clientId ? { ...r, expanded: !r.expanded } : r) ?? prev);
  };

  const expandAll = () => setRows((prev) => prev?.map((r) => ({ ...r, expanded: true })) ?? prev);
  const collapseAll = () => setRows((prev) => prev?.map((r) => ({ ...r, expanded: false })) ?? prev);

  const removeRow = (clientId: string) => {
    setRows((prev) => prev?.filter((r) => r.clientId !== clientId) ?? prev);
  };

  const resetImport = () => {
    setRows(null);
    setUploadError(null);
  };

  const CHUNK_SIZE = 50;

  const handleCommit = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => r.bucket !== 'error').map((r) => ({
      rowNumber: r.rowNumber,
      ...r.normalized,
    }));
    setCommitting(true);
    setFinished(false);
    setFailures([]);
    setFatalError(null);
    setCommittedCount(0);
    setTotalToCommit(toImport.length);

    for (let i = 0; i < toImport.length; i += CHUNK_SIZE) {
      const chunk = toImport.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch('/api/invitations/import/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFatalError(data.error || `Server returned ${res.status}`);
          setCommitting(false);
          return;
        }
        setCommittedCount((c) => c + (data.createdCount || 0));
        if (Array.isArray(data.failures) && data.failures.length > 0) {
          setFailures((prev) => [...prev, ...data.failures]);
        }
      } catch (err) {
        setFatalError(err instanceof Error ? err.message : 'Network error');
        setCommitting(false);
        return;
      }
    }
    setCommitting(false);
    setFinished(true);
  };

  // State 1 — upload
  if (!rows) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Import Invitations</h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload an Excel file to create dozens of invitations at once.
            Download the template first to see the expected columns.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>1. Download the template</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">
              Starts with a styled header row and two sample rows so the format is obvious.
              Delete the sample rows before uploading.
            </p>
            <a href="/invitation-import-template.xlsx" download>
              <Button variant="outline">Download template.xlsx</Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2. Upload your filled-in sheet</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".xlsx"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              className="block text-sm"
            />
            {uploading && <p className="text-sm text-gray-500">Parsing…</p>}
            {uploadError && <p className="text-sm text-red-700">{uploadError}</p>}
          </CardContent>
        </Card>

        <Link href="/admin/invitations" className="text-sm text-primary hover:underline">
          ← Back to Invitations
        </Link>
      </div>
    );
  }

  // State 2 — preview with collapsible cards
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Import Invitations — Preview</h1>
        <Button variant="outline" onClick={resetImport}>Upload a different file</Button>
      </div>

      <div className="flex gap-2 text-sm flex-wrap">
        <span className="px-3 py-1 rounded bg-emerald-100 text-emerald-800">{readyCount} ready</span>
        <span className="px-3 py-1 rounded bg-sky-100 text-sky-800">{duplicateCount} duplicates</span>
        <span className="px-3 py-1 rounded bg-red-100 text-red-800">{errorCount} errors</span>
        <span className="px-3 py-1 rounded bg-gray-100 text-gray-600">you have {existingCount} invitations already</span>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={expandAll}>Expand all</Button>
        <Button size="sm" variant="outline" onClick={collapseAll}>Collapse all</Button>
      </div>

      <div className="space-y-2">
        {rows.map((r) => {
          const summary = summarizeRow(r);
          const errors = r.bucket === 'error' ? clientValidate(r.normalized) : [];
          const leftBar = r.bucket === 'error' ? 'border-l-4 border-red-500' : r.bucket === 'duplicate' ? 'border-l-4 border-sky-500' : 'border-l-4 border-emerald-500';
          return (
            <div key={r.clientId} className={`bg-white rounded shadow-sm ${leftBar}`}>
              {/* Header — always visible. Click anywhere (except the buttons) to toggle expanded. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpanded(r.clientId)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(r.clientId); } }}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
              >
                <span className={`text-xs px-2 py-0.5 rounded ${summary.badgeClass}`}>{summary.badge}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{summary.title}</div>
                  {summary.subtitle && <div className="text-xs text-gray-500 truncate">{summary.subtitle}</div>}
                </div>
                <span className="text-gray-400 text-sm select-none" aria-hidden>{r.expanded ? '▾' : '▸'}</span>
                <button
                  type="button"
                  className="text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded"
                  onClick={(e) => { e.stopPropagation(); removeRow(r.clientId); }}
                  aria-label={`Remove ${summary.title} from import`}
                >
                  ✕
                </button>
              </div>

              {/* Expanded body */}
              {r.expanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                  {/* Household Name is the primary identifier — full-width. */}
                  <div className="pt-4">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Household Name</label>
                    <Input
                      value={r.normalized.householdName}
                      onChange={(e) => updateRow(r.clientId, { householdName: e.target.value })}
                    />
                  </div>

                  {/* Contact — two columns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-gray-400 font-normal">(your chase email)</span></label>
                      <Input type="email" value={r.normalized.email ?? ''} onChange={(e) => updateRow(r.clientId, { email: e.target.value || null })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Contact Email <span className="text-gray-400 font-normal">(pre-fills guest's RSVP)</span></label>
                      <Input type="email" value={r.normalized.contactEmail ?? ''} onChange={(e) => updateRow(r.clientId, { contactEmail: e.target.value || null })} />
                    </div>
                  </div>

                  {/* Mailing address — stacked, matches public RSVP form layout */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-600">Mailing Address</label>
                    <Input value={r.normalized.mailingAddress1 ?? ''} onChange={(e) => updateRow(r.clientId, { mailingAddress1: e.target.value || null })} placeholder="Address line 1" />
                    <Input value={r.normalized.mailingAddress2 ?? ''} onChange={(e) => updateRow(r.clientId, { mailingAddress2: e.target.value || null })} placeholder="Address line 2 (apt, suite)" />
                    <div className="grid grid-cols-3 gap-2">
                      <Input className="col-span-2" value={r.normalized.mailingCity ?? ''} onChange={(e) => updateRow(r.clientId, { mailingCity: e.target.value || null })} placeholder="City" />
                      <Input value={r.normalized.mailingState ?? ''} onChange={(e) => updateRow(r.clientId, { mailingState: e.target.value || null })} placeholder="State" />
                    </div>
                    <Input value={r.normalized.mailingPostalCode ?? ''} onChange={(e) => updateRow(r.clientId, { mailingPostalCode: e.target.value || null })} placeholder="Postal code" />
                  </div>

                  {/* Guests + plus-ones */}
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <label className="block text-xs font-medium text-gray-600">Guests <span className="text-gray-400 font-normal">(first name becomes primary)</span></label>
                      <div className="flex items-baseline gap-2">
                        <label className="text-xs font-medium text-gray-600">Plus-ones allowed</label>
                        <Input
                          type="number"
                          min={0}
                          className="w-20"
                          value={r.normalized.plusOnesAllowed}
                          onChange={(e) => updateRow(r.clientId, { plusOnesAllowed: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <Input
                          key={i}
                          value={r.normalized.guestNames[i] ?? ''}
                          placeholder={`Guest ${i + 1}`}
                          onChange={(e) => {
                            const next = [...r.normalized.guestNames];
                            while (next.length <= i) next.push('');
                            next[i] = e.target.value;
                            // Collapse back to the non-empty-in-order shape the API expects.
                            const trimmed = next.map((s) => s.trim()).filter((s) => s !== '');
                            updateRow(r.clientId, { guestNames: trimmed });
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400 font-normal">(admin-only)</span></label>
                    <Textarea rows={2} value={r.normalized.notes ?? ''} onChange={(e) => updateRow(r.clientId, { notes: e.target.value || null })} />
                  </div>

                  {/* Inline bucket callouts */}
                  {errors.length > 0 && (
                    <div className="rounded bg-red-50 text-red-800 text-xs px-3 py-2">
                      <span className="font-medium">Fix before importing:</span> {errors.join(' · ')}
                    </div>
                  )}
                  {r.bucket === 'duplicate' && r.duplicateMeta && (
                    <div className="rounded bg-sky-50 text-sky-800 text-xs px-3 py-2">
                      <span className="font-medium">Possible duplicate —</span>
                      {r.duplicateMeta.matchedExisting && ' matches an existing invitation in your DB.'}
                      {r.duplicateMeta.matchedInSheet && ' another row in this file has the same household + address.'}
                      {' '}Will import unless you remove it.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 sticky bottom-0 bg-gray-50 py-3 -mx-6 px-6 border-t border-gray-200">
        <Button
          disabled={errorCount > 0 || (readyCount + duplicateCount) === 0}
          onClick={handleCommit}
        >
          Import {readyCount + duplicateCount} invitation{(readyCount + duplicateCount) === 1 ? '' : 's'}
        </Button>
        {errorCount > 0 && <span className="text-xs text-red-700">Fix errors above before importing.</span>}
      </div>

      {(committing || finished || fatalError) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            {committing ? (
              <>
                <CardHeader><CardTitle>Importing…</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all" style={{ width: totalToCommit ? `${(committedCount / totalToCommit) * 100}%` : '0%' }} />
                  </div>
                  <p className="text-sm text-gray-600">{committedCount} of {totalToCommit} imported</p>
                </CardContent>
              </>
            ) : fatalError ? (
              <>
                <CardHeader><CardTitle>Import interrupted</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{fatalError}</p>
                  <p className="text-sm text-gray-600">{committedCount} of {totalToCommit} invitations were imported before the error. You can go to Invitations to see the partial result, then re-upload a corrected sheet with the missing rows.</p>
                  <div className="flex justify-end">
                    <Link href="/admin/invitations"><Button>Go to Invitations</Button></Link>
                  </div>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader><CardTitle>{failures.length === 0 ? 'Imported' : 'Imported with errors'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    Imported {committedCount} of {totalToCommit} invitation{totalToCommit === 1 ? '' : 's'}.
                    {failures.length > 0 && ` ${failures.length} failed.`}
                  </p>
                  {failures.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-red-700">Show failure details</summary>
                      <ul className="mt-2 space-y-1">
                        {failures.map((f, i) => (
                          <li key={i} className="text-xs">
                            <span className="font-medium">Row {f.rowNumber} ({f.householdName}):</span> {f.error}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-gray-500">Fix these in a new sheet and re-upload just those rows.</p>
                    </details>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setFinished(false); resetImport(); }}>Import another file</Button>
                    <Link href="/admin/invitations"><Button>Go to Invitations</Button></Link>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
