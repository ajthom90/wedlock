'use client';

import React, { useMemo, useState } from 'react';
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
// for the final failures report).
type EditableRow = ParsedRow & { clientId: string; bucket: 'ready' | 'duplicate' | 'error'; duplicateMeta?: { matchedExisting: boolean; matchedInSheet: boolean } };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Client-side mirror of validateRow so the table can re-bucket as the admin
// edits. MUST stay in sync with src/lib/invitationImport.ts validateRow.
function clientValidate(n: NormalizedRow): string[] {
  const errors: string[] = [];
  if (!n.householdName.trim()) errors.push('Household name is required');
  if (n.email && !EMAIL_RE.test(n.email)) errors.push('Email is not a valid email address');
  if (n.contactEmail && !EMAIL_RE.test(n.contactEmail)) errors.push('Contact email is not a valid email address');
  if (!Number.isInteger(n.plusOnesAllowed) || n.plusOnesAllowed < 0) errors.push('Plus-Ones Allowed must be 0 or a positive whole number');
  return errors;
}

export default function InvitationImportPage() {
  const [existingCount, setExistingCount] = useState(0);
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
      const toEditable = (r: ParsedRow, bucket: EditableRow['bucket'], meta?: EditableRow['duplicateMeta']): EditableRow => ({
        ...r,
        clientId: `${r.rowNumber}-${Math.random().toString(36).slice(2, 8)}`,
        bucket,
        duplicateMeta: meta,
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

  const removeRow = (clientId: string) => {
    setRows((prev) => prev?.filter((r) => r.clientId !== clientId) ?? prev);
  };

  const resetImport = () => {
    setRows(null);
    setUploadError(null);
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

  // State 2 — preview with inline edits
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Import Invitations — Preview</h1>
        <Button variant="outline" onClick={resetImport}>Upload a different file</Button>
      </div>

      <div className="flex gap-2 text-sm">
        <span className="px-3 py-1 rounded bg-emerald-100 text-emerald-800">{readyCount} ready</span>
        <span className="px-3 py-1 rounded bg-sky-100 text-sky-800">{duplicateCount} duplicates</span>
        <span className="px-3 py-1 rounded bg-red-100 text-red-800">{errorCount} errors</span>
        <span className="px-3 py-1 rounded bg-gray-100 text-gray-600">you have {existingCount} invitations already</span>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="text-sm border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 bg-gray-50 z-10 text-left px-3 py-2 border-b border-gray-200 min-w-[200px]">Household Name</th>
              <th className="sticky left-[200px] bg-gray-50 z-10 text-left px-3 py-2 border-b border-gray-200 min-w-[180px]">Email</th>
              <th className="sticky left-[380px] bg-gray-50 z-10 text-left px-3 py-2 border-b border-gray-200 min-w-[180px]">Contact Email</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Address 1</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Address 2</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">City</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">State</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Postal</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">+1s</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Notes</th>
              {Array.from({ length: 10 }).map((_, i) => (
                <th key={i} className="text-left px-3 py-2 border-b border-gray-200">Guest {i + 1}</th>
              ))}
              <th className="text-left px-3 py-2 border-b border-gray-200"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const errors = r.bucket === 'error' ? clientValidate(r.normalized) : [];
              const leftColor = r.bucket === 'error' ? 'border-l-4 border-red-500' : r.bucket === 'duplicate' ? 'border-l-4 border-sky-500' : 'border-l-4 border-emerald-500';
              return (
                <React.Fragment key={r.clientId}>
                  <tr className={`${leftColor}`}>
                    <td className="sticky left-0 bg-white px-2 py-1 border-b border-gray-100">
                      <Input value={r.normalized.householdName} onChange={(e) => updateRow(r.clientId, { householdName: e.target.value })} />
                    </td>
                    <td className="sticky left-[200px] bg-white px-2 py-1 border-b border-gray-100">
                      <Input type="email" value={r.normalized.email ?? ''} onChange={(e) => updateRow(r.clientId, { email: e.target.value || null })} />
                    </td>
                    <td className="sticky left-[380px] bg-white px-2 py-1 border-b border-gray-100">
                      <Input type="email" value={r.normalized.contactEmail ?? ''} onChange={(e) => updateRow(r.clientId, { contactEmail: e.target.value || null })} />
                    </td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingAddress1 ?? ''} onChange={(e) => updateRow(r.clientId, { mailingAddress1: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingAddress2 ?? ''} onChange={(e) => updateRow(r.clientId, { mailingAddress2: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingCity ?? ''} onChange={(e) => updateRow(r.clientId, { mailingCity: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingState ?? ''} onChange={(e) => updateRow(r.clientId, { mailingState: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingPostalCode ?? ''} onChange={(e) => updateRow(r.clientId, { mailingPostalCode: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100 w-20"><Input type="number" min={0} value={r.normalized.plusOnesAllowed} onChange={(e) => updateRow(r.clientId, { plusOnesAllowed: parseInt(e.target.value, 10) || 0 })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Textarea rows={1} value={r.normalized.notes ?? ''} onChange={(e) => updateRow(r.clientId, { notes: e.target.value || null })} /></td>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <td key={i} className="px-2 py-1 border-b border-gray-100">
                        <Input
                          value={r.normalized.guestNames[i] ?? ''}
                          onChange={(e) => {
                            const next = [...r.normalized.guestNames];
                            while (next.length <= i) next.push('');
                            next[i] = e.target.value;
                            // Collapse back to the non-empty-in-order shape the API expects.
                            const trimmed = next.map((s) => s.trim()).filter((s) => s !== '');
                            updateRow(r.clientId, { guestNames: trimmed });
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 border-b border-gray-100">
                      <Button size="sm" variant="danger" onClick={() => removeRow(r.clientId)}>✕</Button>
                    </td>
                  </tr>
                  {errors.length > 0 && (
                    <tr>
                      <td colSpan={21} className="sticky left-0 bg-red-50 text-red-800 text-xs px-3 py-1 border-b border-red-200">
                        Row {r.rowNumber}: {errors.join(' · ')}
                      </td>
                    </tr>
                  )}
                  {r.bucket === 'duplicate' && r.duplicateMeta && (
                    <tr>
                      <td colSpan={21} className="sticky left-0 bg-sky-50 text-sky-800 text-xs px-3 py-1 border-b border-sky-200">
                        Row {r.rowNumber}: possible duplicate —
                        {r.duplicateMeta.matchedExisting && ' matches an existing invitation.'}
                        {r.duplicateMeta.matchedInSheet && ' another row in this file has the same household + address.'}
                        {' '}Will import unless you remove it.
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          disabled={errorCount > 0 || (readyCount + duplicateCount) === 0}
          onClick={() => { /* wired in Task 10 */ }}
        >
          Import {readyCount + duplicateCount} invitation{(readyCount + duplicateCount) === 1 ? '' : 's'}
        </Button>
        {errorCount > 0 && <span className="text-xs text-red-700">Fix errors above before importing.</span>}
      </div>
    </div>
  );
}
