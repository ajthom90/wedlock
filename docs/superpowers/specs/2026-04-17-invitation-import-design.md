# Bulk invitation import — design

## Goal

Let the admin (bride/groom) create dozens or hundreds of invitations in one shot by uploading an Excel (.xlsx) file, instead of clicking through the admin UI for each household. Ship a downloadable template alongside so the couple has a clear starting point to share between themselves while compiling the guest list.

## Non-goals (V1)

- Updating existing invitations via re-upload. Create-only. If admin needs to edit after import, they do it in the admin UI or delete + re-import.
- CSV support. Excel only — everyone's comfortable with Excel, and one file format means one parsing path.
- Auto-resume after browser close. A failed import leaves the DB in its partial-commit state; admin sees the final report and retries what's missing.
- Background jobs / polling / job-state persistence. The import is synchronous from the client's perspective, chunked into 50-row commits with a progress bar; the short actual runtime doesn't warrant a job table.
- Country field or care-of line in the mailing address. Can add later if the couple has international guests; start with the 5-field US-shaped address that covers the 99% case.
- Editing the existing free-text `Invitation.address` column. It stays in the schema for backward compat but nothing new reads or writes to it.

## Schema

Additive only. `npx prisma db push` is safe on existing prod DBs.

### `Invitation` — add 5 optional structured mailing-address fields

```prisma
mailingAddress1   String?
mailingAddress2   String?
mailingCity       String?
mailingState      String?
mailingPostalCode String?
```

The existing `address String?` column stays — pre-existing invitations keep their data. New writes (from the bulk import and from the updated RSVP form) go to the structured fields. The schema comment on `address` gets updated to note it's deprecated in favor of the structured fields.

### No other schema changes.

Import creates `Invitation` + `Guest` rows through existing Prisma relations. Invitation code generation reuses the existing `generateUniqueCode` helper.

## RSVP form — address UI update (tied to this feature)

The public `/rsvp?code=…` form currently renders a single free-text "Mailing address" Textarea. It's replaced with 5 inputs: Address Line 1, Address Line 2, City, State, Postal Code. Inputs pre-fill from the invitation's structured fields if the admin imported them. On submit, values go to the structured fields — never to the old `address` column.

Existing invitations with `address` text but no structured fields: the form shows empty structured inputs. The old text is silently ignored on the public form (still visible in the admin detail view for reference).

## Excel template

Served as a committed static asset at `/public/invitation-import-template.xlsx`, downloaded from a button on the import page. Two sheets:

**Sheet 1 (data, name: "Invitations")** — 20 columns, in order:

| # | Column | Required | Notes |
|---|---|---|---|
| 1 | Household Name | yes | Non-empty after trim |
| 2 | Email | no | Admin contact email for this household |
| 3 | Contact Email | no | Guest-facing email for RSVP confirmation / day-of broadcasts. Pre-fills the public RSVP form. |
| 4 | Address Line 1 | no | |
| 5 | Address Line 2 | no | |
| 6 | City | no | |
| 7 | State | no | Free text — handles international |
| 8 | Postal Code | no | Free text — handles US ZIP + international |
| 9 | Plus-Ones Allowed | no | Integer 0+, defaults to 0 |
| 10 | Notes | no | Admin-only |
| 11-20 | Guest 1 – Guest 10 | no | First non-empty becomes `isPrimary: true` |

Pre-populated with a styled header row and two sample rows (simple household; household with plus-ones) so the format is obvious at a glance.

**Max Guests is deliberately NOT a column.** On import, `Invitation.maxGuests` is computed as `guestNames.length + plusOnesAllowed`. Setting it independently has no real use case this feature needs to serve. The admin can still edit it on the per-invitation editor for rare edge cases.

**Sheet 2 (name: "Instructions")** — per-column explanations in plain language, plus a note at the top: "Edit Sheet 1 ('Invitations'). Delete these sample rows before uploading."

Template generation: a one-off Node script `scripts/build-import-template.ts` creates the file using `exceljs`. The script is committed; the generated .xlsx is also committed so production containers don't need to regenerate it at build time.

## Excel parser + validator

New module `src/lib/invitationImport.ts`.

### Types

```ts
export type ParsedRow = {
  rowNumber: number;       // 1-indexed Excel row (counting header as row 1)
  raw: Record<string, string>;  // original cell strings for error messages
  normalized: NormalizedRow;
};

export type NormalizedRow = {
  householdName: string;
  email: string | null;
  contactEmail: string | null;
  mailingAddress1: string | null;
  mailingAddress2: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  plusOnesAllowed: number;
  notes: string | null;
  guestNames: string[];    // non-empty, trimmed, in column order
};

export type RowValidation = {
  row: ParsedRow;
  errors: string[];        // blocking
  warnings: string[];      // informational (duplicate match)
};
```

### `parseWorkbook(buffer: Buffer): ParsedRow[]`

1. Load with `exceljs`, pick the first sheet matching `"Invitations"` (case-insensitive) or the first worksheet if only one exists.
2. Verify the first row matches the expected column headers exactly (trimmed, case-insensitive). If not, throw a validation error so the preview endpoint can return a clear "wrong format — check your header row" 400.
3. For each subsequent row:
   - If every cell is empty, skip (handles trailing blanks).
   - Otherwise build a `ParsedRow` with `rowNumber` (the actual Excel row index) and normalized values (trim strings; parse Plus-Ones Allowed as int; collect non-empty guest columns).
4. Return the array.

### `validateRow(row: ParsedRow): RowValidation`

- `householdName` empty → error `"Household name is required"`.
- `email` non-empty and doesn't match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → error `"Email is not a valid email address"`.
- `contactEmail` same check → error `"Contact email is not a valid email address"`.
- `plusOnesAllowed` non-numeric or negative → error `"Plus-Ones Allowed must be 0 or a positive whole number"`.
- No other hard requirements. Missing addresses, missing guests, missing notes are all OK.

Validation does not know about duplicates. That's a separate pass.

### Duplicate bucketing

Performed in the preview endpoint, after validation, using both the DB and previously-seen rows from the same upload.

```ts
function dupeKey(row: NormalizedRow): string {
  const name = row.householdName.trim().toLowerCase();
  const address = [
    row.mailingAddress1, row.mailingAddress2,
    row.mailingCity, row.mailingState, row.mailingPostalCode,
  ].filter(Boolean).join('|').toLowerCase();
  return `${name}|${address}`;
}
```

Rules:
- `name|address` key matches an existing DB invitation's equivalent key → mark the row as duplicate.
- Two rows in the same uploaded file produce the same key → mark both as duplicates (of each other).
- If both sides have empty address components, the key degenerates to `name|` — collisions there are still flagged, matching the user's intent ("if there's nothing to disambiguate on, name alone is the key").

Duplicate is a *warning*, not an error. Rows still import by default; admin can delete the row in the preview table to skip it.

## HTTP API

Two admin-only routes, both gated by `isAuthenticated()`.

### `POST /api/invitations/import/preview`

Accepts a multipart file upload of an .xlsx file.

1. Read file into a Buffer.
2. `parseWorkbook(buffer)`. If it throws (bad format / bad header), return `400 { error: "Could not read Excel file — check the file format and header row" }`.
3. `validateRow` over every parsed row.
4. Load existing `{ householdName, mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingPostalCode }` from `prisma.invitation.findMany` and build the existing-keys set.
5. Bucket every row:
   - has errors → `error` bucket
   - duplicate key match → `duplicate` bucket
   - otherwise → `ready` bucket
6. Return:

```ts
{
  totalRows: number;
  existingInvitationCount: number;
  ready:     ParsedRow[];
  duplicate: Array<ParsedRow & { matchedExisting: boolean; matchedInSheet: boolean }>;
  error:     Array<ParsedRow & { errors: string[] }>;
}
```

Does **not** write to the DB. Stateless and idempotent — admin can re-upload as many times as they want.

### `POST /api/invitations/import/commit`

Accepts JSON `{ rows: NormalizedRow[] }`. The client sends the rows it wants to create — which came from the preview but may have been edited in the inline preview table.

1. Re-validate each row server-side. Any row failing validation → return `400` with per-row errors, no DB writes.
2. Process rows sequentially (NOT wrapped in a single transaction):
   - Generate a unique code via `generateUniqueCode`.
   - Create `Invitation` + `Guest` rows via `prisma.invitation.create({ data: { ..., guests: { create: [...] } } })`.
   - Catch per-row errors (constraint violations, etc.) into a `failures: Array<{ rowNumber, householdName, error }>` list. Don't abort the loop on per-row failure.
3. Return `{ createdCount: number, failedCount: number, failures: [...] }`.

`Invitation.maxGuests` is computed server-side as `guestNames.length + plusOnesAllowed`.

The client calls this endpoint once per chunk of 50 rows (see UI section). Chunk size is a client-side implementation detail — the endpoint accepts any array length.

## UI

Entry point: a new "Import from Excel" button on `/admin/invitations`, next to "Add Invitation." Clicking navigates to `/admin/invitations/import`.

### State 1 — upload

- Page title + 2-sentence explainer.
- **Download template** button → serves `/public/invitation-import-template.xlsx`. Filename stays `invitation-import-template.xlsx`.
- **File picker** accepting `.xlsx` only. On file selected, POSTs to the preview endpoint immediately.
- Back link to `/admin/invitations`.

### State 2 — preview table

- **Summary strip** at top: three colored pills ("N ready" green, "N duplicates" blue, "N errors" red) + "you currently have M invitations" context.
- **Table**: one row per `ParsedRow`, grouped into three collapsible sections (Errors first, then Duplicates, then Ready). Each cell is an inline editable input (text for most fields, number for Plus-Ones, email for email columns).
- **Row visuals**:
  - Left-edge color by bucket (red / blue / green).
  - Red border on cells with validation errors; reason text under the row.
  - Blue "⚠ Possible duplicate" banner on duplicate rows, specifying matched-existing vs matched-in-sheet.
- **Per-row trash button** to drop that row from this import (client-only, doesn't affect the file).
- **Live re-validation**: editing any cell runs client-side `validateRow` immediately, moving the row between buckets as needed.
- **Sticky left columns** for Household Name, Email, Contact Email so admin can scan the rest horizontally without losing context.
- **Primary button: "Import N invitations"** — N = live count of (ready + duplicate). Disabled whenever any row is in the error bucket.
- **Secondary button:** "Cancel / upload different file" — returns to State 1 and clears state.

### State 3 — importing / final report

- Modal overlay (not dismissible while in progress) with a progress bar and `{createdSoFar} / {total}` text.
- Client chunks rows into batches of 50, calls `/api/invitations/import/commit` sequentially. After each chunk response, updates `createdSoFar` and `failedSoFar`, appends any returned failures to a local list.
- When all chunks done, modal transitions to the final report:
  - **Zero failures**: big green check, "Imported N invitations." Primary button "Go to Invitations," secondary "Import another file."
  - **Some failures**: "Imported X of Y invitations. Z failed." Expandable list — each failure shows `Row <rowNumber> (<householdName>) — <error>`. Button: "Go to Invitations." The failed rows are NOT retained in a "try again" state; admin fixes them in Excel and re-uploads just those rows.
- **Fatal error during chunking** (network drop, 500 response, auth expired): modal shows the specific error + "Imported X of Y so far. Something went wrong. Go to Invitations to check the partial state, then try again with a corrected sheet." No automatic retry.

**Client-chunk implementation detail**: chunks are processed sequentially, not in parallel. Sequential keeps the UI progress accurate and sidesteps any theoretical race on code generation. Total wall-clock time for 300 rows is expected to be single-digit seconds.

## Error semantics — summary

- **Client-side preview validation**: blocks the Import button until rows are clean.
- **Server-side preview re-validation**: runs in the preview endpoint for defense-in-depth.
- **Server-side commit re-validation**: runs on every commit request; rejects the whole chunk if any row fails validation (shouldn't happen if client validated; this catches client-side bypass).
- **Per-row DB failures**: caught individually, reported in the chunk's `failures` array, don't abort subsequent rows or chunks.
- **Fatal network/server failures during chunking**: abort the import. Admin sees a partial-success report with the specific error and the count imported so far.

## Testing

### Unit tests (`vitest`)

**`src/lib/invitationImport.ts`:**

- `validateRow` — empty household name errors; invalid email on either column errors; negative plus-ones errors; whitespace trimmed; first non-empty Guest column becomes `isPrimary`; gap-in-guest-columns handled (Guest 1 blank, Guest 2 filled → Guest 2 becomes primary).
- `parseWorkbook` — happy path with 2 rows; header-only file returns empty; trailing blank rows dropped; missing / wrong-order header throws; "Instructions" sheet is ignored.
- Duplicate bucketing (pure function) — name match + different address is NOT a dupe; name + full address match IS; both sides missing address and name matches IS; case + trim insensitive.

### Route handlers

Not unit-tested, consistent with the project pattern of testing services not routes. The preview and commit routes are thin glue around tested functions. Manual smoke test covers integration.

### Manual smoke test

1. Download template → open in Excel and Numbers → verify columns, sample rows, Instructions sheet render correctly.
2. Upload a 5-row sheet (1-guest, 2-guest with plus-ones, 6-guest household) → all Ready, import, verify invitations appear.
3. Edit a row in preview to clear Household Name → row shifts to Errors, Import button disables.
4. Fix it → row shifts back, Import re-enables.
5. Upload a sheet with row 3 matching an existing household name + address → only row 3 flagged blue.
6. Upload with duplicate-within-sheet → both rows flagged.
7. Upload 60 rows to exercise 2 chunk boundaries → progress bar ticks twice, final count is 60.
8. (Optional) Upload 300+ rows → verify wall-clock time is tolerable and progress bar updates are visible.

### CI guardrails

- `npx tsc --noEmit`
- `npx vitest run`

## Rollout

- Schema changes are additive (5 new optional columns). `npx prisma db push` is safe.
- New npm dep: `exceljs`. `@types/…` not needed (bundles its own types).
- Committed static asset: `/public/invitation-import-template.xlsx` plus the generator script `scripts/build-import-template.ts`.
- No feature flag. The import page is admin-only and is only surfaced by navigating to `/admin/invitations` and clicking the new button; no guest-facing surface, no toggle worth having.
- **Release notes** (required before bumping per `feedback_release_notes_before_bump.md`): one `feature` entry for bulk import, one `feature` entry for the structured mailing address, one `improvement` entry for the new 5-field address UI on the public RSVP form.
