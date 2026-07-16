# RSVP Code Labels — Design

**Date:** 2026-07-16
**Status:** Approved

## Problem

Getting an RSVP code into a guest's hands currently means printing the QR
invitation-card PDF, cutting the sheet, and tucking a card into each invite.
The couple wants peel-and-stick labels instead: print the RSVP code onto
standard Avery address-label sheets and stick a label directly onto each
pre-printed invite card. No cutting.

## Decisions

- **Label content:** household name (small, regular weight) on line 1, then
  `RSVP code: <code>` (bold, larger) underneath. The name is deliberate — codes
  are per-household, and an unlabeled sticker mixup silently sends guests into
  someone else's RSVP.
- **UI placement:** extend the existing Print Mailing Labels page
  (`/admin/invitations/labels`) with a "Label type" selector (Mailing address /
  RSVP code) rather than adding a separate page. Format picker, start-position,
  and the selection list are shared.
- **No new feature flag.** This is an enhancement to the existing labels screen
  (part of the unflagged invitations module), not a new module.

## Changes

### `src/lib/mailingLabelsPdf.ts`

- `LabelLine = string | { text: string; emphasis?: boolean }`. Emphasized lines
  render in Helvetica-Bold at ~1.4× the label's fitted base size.
- `fitFontSize` measures every line at its own effective font + size multiplier
  so the shared auto-shrink (floor 7pt) and ellipsis truncation keep working;
  the returned base size is scaled per line at draw time.
- `renderLabelsPdf` accepts `labels: Array<{ lines: LabelLine[] }>`; plain
  strings behave exactly as today, so the address-label path is unchanged.
  Each line's leading (1.2×) derives from that line's own effective size, so a
  bold code line gets proportionally more vertical room than the name above it.
- New pure composer:
  `composeCodeLabelLines({ householdName, code })` →
  `[householdName, { text: 'RSVP code: <code>', emphasis: true }]`.

### `/admin/invitations/labels` page

- `labelType` state: `'address' | 'code'`, radio at the top of the sheet card.
- Code mode: every invitation is selectable (codes always exist — no
  `hasAddress` gate), the row preview shows the code instead of the address,
  quick-select shows "Select all" (attending/pending/clear unchanged), and the
  download is `rsvp-code-labels-<format>-<date>.pdf`.
- Page copy adjusts per mode. All four Avery formats supported; on 5160
  (1"×2.63") the name fits at ~10pt with the code at ~14pt bold.

## Error handling

Nothing new: generation is client-side pdf-lib exactly like address labels;
existing error banner covers failures. Auto-shrink + truncation cover absurdly
long household names.

## Testing

Extend `src/lib/mailingLabelsPdf.test.ts`:

- `composeCodeLabelLines` output shape.
- Rendered PDF embeds Helvetica-Bold and draws the emphasized line larger than
  the plain line.
- Mixed string/styled labels still fit-shrink and truncate correctly.
- Existing address-label tests pass unchanged (guards the renderer refactor).
