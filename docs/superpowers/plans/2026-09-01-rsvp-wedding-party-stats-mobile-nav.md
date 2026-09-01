# RSVP meal-count fix, wedding-party scope, and mobile admin nav

> **For agentic workers:** Implement this plan task-by-task, in order. Each task ends in its own commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make attending-guest totals and meal-choice totals agree (the "165 confirmed guests but 166 meal choices" report), let the couple scope RSVP stats to households flagged `isWeddingParty` (with a per-meal breakdown so rehearsal-dinner counts such as kids' meals are visible), and turn the admin sidebar into a closable drawer on phones.

**Architecture:** One new pure module `src/lib/rsvpMeals.ts` defines what a countable meal is (read-side fix — existing data displays correctly immediately) and how to prune meals to attendees (write-side fix — data stops drifting). The dashboard and a new RSVPs-page meal card both use it. The admin RSVP `PUT` is routed through the existing `validateRsvpSubmission` so it prunes and normalizes exactly like the public form. The RSVPs page gains a wedding-party **scope** (not a status tab, not a feature flag, not on the dashboard). A client `AdminShell` wraps the admin chrome so the sidebar can overlay below `md` without changing desktop.

**Tech stack:** Next.js 14 App Router, Prisma/SQLite (no schema change), Tailwind, vitest. Existing helpers: `countRsvpPeople` (`src/lib/rsvpCounts.ts`), `validateRsvpSubmission` (`src/lib/rsvpValidation.ts`).

**Provenance:** Merged from two independent plans (Claude + Grok). Where they differed the choice is noted inline.

## Global constraints

- No `prisma/schema.prisma` changes. No data migration, boot-time scrub, or "repair" button — CLAUDE.md forbids guest-data rewrites without opt-in, and the read-side fix makes the numbers right without one.
- No feature flag. Flags gate modules; this is a filter on an existing admin page that hides itself when unused.
- "Wedding party" means `Invitation.isWeddingParty` (households). Never `WeddingPartyMember` (the public display model).
- Desktop admin sidebar (`w-64`, always visible from `md` up, `localStorage` group collapse under `admin-nav-collapsed-groups`, `hydrated` gate) must behave exactly as today.
- Do **not** bump `package.json`. The maintainer runs `./scripts/docker.sh bump-minor` separately; the release-notes entry must land first (Task 6).
- Verify after every task: `npx tsc --noEmit` and `npx vitest run` — both must be clean (baseline: 172 tests pass, tsc clean).
- Commit convention: sentence-case imperative subject ≤70 chars, short body, and the trailer in the task prompt. Never `--no-verify`.

---

## 1. Root cause of 165 guests vs 166 meals

**Read path that over-counts.** `AdminDashboard` in `src/app/admin/(authenticated)/page.tsx` builds `mealCounts` inline: for every `attending === 'yes'` household it counts each `guestMeals[guestId]` whose key is a *live* guest ID — it never checks whether that guest is in `attendingGuests`. It also counts plus-one meals without requiring a name. People counts (`countRsvpPeople`) use the `attendingGuests` roster, so the two totals are derived from different sets.

**Write path that leaves the leftover.** The public `POST /api/rsvp` is safe: `validateRsvpSubmission` keeps a meal only when its guest is in the attending set. The admin path is the hole:

1. `toggleEditAttendingGuest` in `src/app/admin/(authenticated)/rsvps/page.tsx` only toggles the ID list; unchecking a guest leaves `editGuestMeals[id]`.
2. `openDetail` seeds `editGuestMeals` from every live guest key, so a leftover meal is re-loaded into the form.
3. `handleSaveResponse` sends the full map.
4. `PUT /api/rsvp/[invitationId]` stringifies `guestMeals` verbatim, does not use the validator, and does not zero fields on decline.

So "Rose picked a meal, then was unchecked" — via admin edit, or a pre-validation-era submission never re-saved through the public form — leaves `{rose: 'X'}` in `guestMeals` while `attendingGuests = [condon]`. That is +1 meal, +0 people.

**Fix.** Read side: `countMealChoices` (below) on the dashboard and the new RSVPs meal card. Write side: admin `PUT` goes through `validateRsvpSubmission`; both clients prune before sending; detail view lists only attendees' meals. The stale production row self-heals on that household's next save.

---

## 2. `src/lib/rsvpMeals.ts` — the single definition of a countable meal

```ts
export interface RsvpMealsInvitation {
  guests: { id: string }[];
  response: {
    attending: string;                // 'yes' | 'no'
    attendingGuests: string | null;   // JSON string[] of guest IDs
    guestMeals: string | null;        // JSON { [guestId]: meal }
    plusOnes: string | null;          // JSON [{ name, meal }]
    plusOneName?: string | null;      // legacy single plus-one columns
    plusOneMeal?: string | null;
  } | null | undefined;
}

/** Keep only entries whose key is in attendingGuestIds and whose value is a non-empty string. */
export function pruneGuestMeals(guestMeals: unknown, attendingGuestIds: string[]): Record<string, string>;

/** Meal label → count across attending households. */
export function countMealChoices(invitations: RsvpMealsInvitation[]): Record<string, number>;
```

`countMealChoices` rules (per household):

| Source | Count a meal iff |
|---|---|
| pending (`response` null) or `attending !== 'yes'` | never |
| `guestMeals`, roster mode (`attendingGuests` parses to an array, including `[]`) | key ∈ live guest IDs **and** key ∈ roster, value is a non-empty string |
| `guestMeals`, numeric fallback (`attendingGuests` null / malformed) | key ∈ live guest IDs, value is a non-empty string (today's behavior minus nothing — there is no roster to intersect) |
| `plusOnes` parses to an array | `name.trim()` non-empty **and** `meal` is a non-empty string |
| `plusOnes` null / malformed (legacy) | `plusOneName` non-empty **and** `plusOneMeal` non-empty → count `plusOneMeal` once. *(Claude's choice over Grok's "don't read the legacy column": this mirrors `countNamedPlusOnes` in `rsvpCounts.ts`, so people and meals agree on legacy rows instead of showing a phantom "No meal selected".)* |

Meal labels are counted exactly as stored (trim whitespace; do not change case). Malformed JSON anywhere → skip that source, never throw.

`pruneGuestMeals`: non-object / array / null input → `{}`; drop keys not in `attendingGuestIds`; drop non-string and empty-string values.

### `src/lib/rsvpMeals.test.ts` — required cases

`pruneGuestMeals`
- keeps attending IDs only; drops non-attending, unknown, non-string values, and `''`
- empty attending list → `{}`
- non-object input (`'nope'`, `null`, `[]`) → `{}`

`countMealChoices`
- the Rose case: guests g1,g2; `attendingGuests: ["g1"]`; `guestMeals: {g1:"Beef", g2:"Kids"}` → `{ Beef: 1 }`
- removed-guest ID in `guestMeals` (and even in `attendingGuests`) is ignored
- named plus-one meal counted; unnamed plus-one with a meal not counted
- empty-string meal ignored; whitespace-only meal ignored
- declined household contributes 0 even with leftover `guestMeals`
- pending household contributes 0
- two households, same meal label → summed
- roster `[]` (plus-ones only): guestMeals leftovers ignored, named plus-one meals counted
- numeric fallback (`attendingGuests: null`) with live-ID `guestMeals` → counted
- malformed JSON in each of `attendingGuests`, `guestMeals`, `plusOnes` → no throw, source skipped
- legacy: `plusOnes: null`, `plusOneName: "Pat"`, `plusOneMeal: "Fish"` → `{ Fish: 1 }`; with `plusOnes: "[]"` present the legacy pair is ignored

`validateRsvpSubmission` is refactored to call `pruneGuestMeals`; all existing `rsvpValidation.test.ts` cases must stay green unchanged.

---

## 3. Wedding-party scope on the admin RSVPs page

File: `src/app/admin/(authenticated)/rsvps/page.tsx` only.

**Control.** A `size="sm"` toggle `Button` labeled **Wedding party** in the existing search/sort row (before the sort buttons), `variant="primary"` when active else `"outline"`, with `aria-pressed`. It is a scope, not a fourth status tab. **Render it only when `invitations.some((i) => i.isWeddingParty)`.** If a refetch leaves no flagged household, reset the scope to `'all'`.

**State.** `const [partyScope, setPartyScope] = useState<'all' | 'wedding-party'>('all')` — not persisted, no URL param.

**Derivation.**
```ts
const scoped = partyScope === 'wedding-party' ? invitations.filter((inv) => inv.isWeddingParty) : invitations;
const peopleByInvitation = scoped.map((inv) => countRsvpPeople(inv));
const mealCounts = countMealChoices(scoped);
const pendingGuests = scoped.filter((inv) => !inv.response)
  .reduce((sum, inv) => sum + inv.guests.length + (inv.plusOnesAllowed || 0), 0);
```

| Surface | Respects scope | Respects status filter / search |
|---|---|---|
| Four stat cards (households + guest counts) | yes | no |
| Pending stat card subtitle → `Pending (N guests)` using `pendingGuests` | yes | no |
| "Not yet responded" accordion | yes | no |
| **New** Meal choices card | yes | no |
| Copy dietary summary / Copy pending emails | yes | no |
| Export CSV (filename `rsvp-responses-wedding-party.csv` when scoped; button label gains ` (wedding party)` when scoped) | yes | no — keep today's "export everything in scope", never only the searched rows |
| Household list | yes, then status + search + sort | yes |

**Chips.** When scoped, show `Filtering: Wedding party` with its own Clear next to the existing status chip; the two Clears are independent.

**Meal choices card.** New `Card` between the pending accordion and the household list, collapsible like the pending card (default expanded), title `Meal choices`. Rows: each label + count sorted by count desc (same look as the dashboard card). Below them, when `sum(mealCounts) < stats.totalGuests` (attending people in scope), a muted row `No meal selected` with the difference. Empty state text `No meal selections yet`. Hide the whole card when there are no meal counts and no attending people in scope.

**Row pill.** On each list row with `inv.isWeddingParty`, the same pill the invitations page uses: `<span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Wedding Party</span>` next to the household name.

**Types.** Add `isWeddingParty: boolean` to the page's local `Invitation` interface (the `GET /api/invitations` payload already includes it).

---

## 4. Mobile-hideable admin sidebar

**Breakpoint `md` (768px). Overlay drawer, not push.** Desktop from `md` up: static `w-64` column, no hamburger, no animation, unchanged.

**Files.** Create `src/components/admin/AdminShell.tsx` (client) and `src/components/admin/AdminNotificationBell.tsx` (client); modify `src/components/admin/AdminNav.tsx` and `src/app/admin/(authenticated)/layout.tsx`.

**Layout** stays a server component (auth redirect) and renders `<AdminShell>{children}</AdminShell>`. `AdminShell` owns `navOpen` (default `false`, never persisted) and renders, in order:

1. Mobile top bar — `md:hidden sticky top-0 z-30 h-14 bg-gray-800 text-white flex items-center gap-3 px-4`: hamburger `☰` button (`aria-label="Open menu"`, `aria-expanded`, `aria-controls="admin-sidebar"`), title `Wedding Admin`, and `<AdminNotificationBell />` pushed right.
2. Backdrop — rendered only when `navOpen`: `fixed inset-0 z-30 bg-black/50 md:hidden`, click closes.
3. `<AdminNav open={navOpen} onClose={() => setNavOpen(false)} />`.
4. `<main className="flex-1 min-w-0 p-4 md:p-8">{children}</main>`.

Outer wrapper: `flex flex-col md:flex-row min-h-screen bg-gray-100`.

**`AdminNav` changes.** Root `<nav id="admin-sidebar">` classes become
`fixed inset-y-0 left-0 z-40 w-64 bg-gray-800 text-white flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 md:min-h-screen md:shrink-0` plus `translate-x-0` when `open`, `-translate-x-full` otherwise. Add a `✕` close button (`md:hidden`, `aria-label="Close menu"`) in the sidebar header. Every `NavLink` and the View Site / Logout controls call `onClose` on click. Close on `pathname` change (separate `useEffect` from the collapse-hydration effect — do not merge them) and on `Escape`. While open on mobile set `document.body.style.overflow = 'hidden'` and restore on close/unmount. Group-collapse logic, `hydrated` gate, feature-flag filtering, and the version footer are untouched.

**Notification bell.** Extract the bell button + panel + unread polling from `AdminNav` into `AdminNotificationBell` (self-contained: its own `unreadCount`, `notifications`, `panelOpen`, 30s poll, outside-click close, mark-read/dismiss handlers, `router.push` on click). Mount it in the sidebar header (as today) and in the mobile top bar. Two mounts means two polls to a tiny endpoint — accepted; do not add a context provider. Panel positioning: sidebar instance keeps `absolute left-0 right-0 top-full`; top-bar instance uses `absolute right-0 top-full w-80 max-w-[calc(100vw-1rem)]` — expose an `align?: 'left' | 'right'` prop, default `'left'`. When a notification is clicked from the drawer, the drawer closes too (route change handles it).

**z-order.** Top bar 30, backdrop 30, drawer 40, existing RSVP detail modal 50 (unchanged). SSR renders the drawer closed on both server and client, so no extra hydration gate.

---

## 5. Tasks

### Task 1: Meal-choice helper module + tests

- Create `src/lib/rsvpMeals.ts`, `src/lib/rsvpMeals.test.ts`; modify `src/lib/rsvpValidation.ts` to use `pruneGuestMeals`.
- [ ] Write every test case in §2 first; run `npx vitest run src/lib/rsvpMeals.test.ts` — expect failure (module missing).
- [ ] Implement `pruneGuestMeals` and `countMealChoices` per §2.
- [ ] Point `validateRsvpSubmission` at `pruneGuestMeals` (same observable behavior).
- [ ] `npx vitest run` and `npx tsc --noEmit` clean.
- [ ] Commit: `Add shared meal-choice counting and pruning helpers`

### Task 2: Dashboard uses the helper

- Modify `src/app/admin/(authenticated)/page.tsx`: replace the inline `mealCounts` loop and `bump` with `countMealChoices(invitations)`. Card UI unchanged. Add `plusOneMeal?: string | null` to the page's `RsvpResponse` type if needed for the structural type.
- [ ] `npx tsc --noEmit` and `npx vitest run` clean.
- [ ] Commit: `Count only attending guests' meals on the dashboard` (body: the Condon/Rose case; no DB rewrite needed).

### Task 3: Stop writing leftover meals

- Modify `src/app/api/rsvp/[invitationId]/route.ts`: load the invitation `include: { guests: { select: { id: true } } }`, run `validateRsvpSubmission({ attending, guestCount, attendingGuests, guestMeals, plusOnes }, { maxGuests, plusOnesAllowed, guestIds, plusOnesEnabled: true })` — `plusOnesEnabled: true` on purpose so the couple can record a plus-one even when the public toggle is off. On `!ok` return `400 { error }`. Persist `validation.data` the same way the public POST does (null for empty JSON fields; decline already zeroed; `guestCount` from the validator). Use the validated data in the change-log snapshot too. Mailing-address / contactEmail patching unchanged.
- Modify `src/app/admin/(authenticated)/rsvps/page.tsx`: in `handleSaveResponse` send `guestMeals: pruneGuestMeals(editGuestMeals, editAttendingGuests)` (null when empty); on `!res.ok` read `error` from the JSON and show it in the modal (small red text above the footer) instead of failing silently. Do **not** delete a meal from `editGuestMeals` on uncheck — re-checking a guest in the same session should bring their previous meal back. Detail view "Meal Choices": only list entries whose guest ID is in the stored `attendingGuests` (when that parses to an array).
- Modify `src/app/(public)/rsvp/page.tsx`: in the submit body send `guestMeals` filtered to `attendingGuests` (belt and suspenders; the server already prunes). Leave `toggleGuest` alone.
- [ ] `npx tsc --noEmit` and `npx vitest run` clean.
- [ ] Commit: `Prune meal choices for guests who are not attending` (body: admin PUT now reuses the public validator; admin save errors surfaced).

### Task 4: Wedding-party scope + meal card on the RSVPs page

- Modify `src/app/admin/(authenticated)/rsvps/page.tsx` per §3.
- [ ] `npx tsc --noEmit` and `npx vitest run` clean.
- [ ] Commit: `Add a wedding-party scope to the admin RSVPs page` (body: stats, pending list, meal breakdown, dietary summary and CSV scope to isWeddingParty households for rehearsal-dinner counts; Pending card now shows a guest count).

### Task 5: Hideable admin sidebar on phones

- Per §4. Create `AdminShell.tsx`, `AdminNotificationBell.tsx`; modify `AdminNav.tsx`, `layout.tsx`.
- [ ] `npx tsc --noEmit` and `npx vitest run` clean.
- [ ] Commit: `Make the admin sidebar a drawer on small screens` (body: below md the nav overlays content behind a hamburger; desktop layout and group collapse unchanged).

### Task 6: Release notes (no version bump)

- Modify `release-notes.json`: insert the entry below as the **first** array element. Do not touch `package.json`.
- [ ] `npx vitest run` clean (release-notes parsing is covered by a test).
- [ ] Commit: `Add 2.17.0 release notes`

```json
{
  "version": "2.17.0",
  "date": "2026-09-01",
  "changes": [
    { "type": "fix", "text": "Meal-choice totals now only count guests who are actually attending. A guest who picked a meal and was later marked as not attending no longer inflates the catering count past the attending-guest total." },
    { "type": "fix", "text": "Saving an RSVP from the admin editor no longer keeps meal choices for unchecked guests, and declining from admin clears attendance fields the same way the public form does. Admin save errors are now shown instead of failing silently." },
    { "type": "feature", "text": "Wedding-party filter on the admin RSVPs page — a Wedding party toggle scopes the stat cards, pending list, meal-choice breakdown, dietary summary, and CSV export to households flagged Wedding Party, so rehearsal-dinner headcounts (including per-meal totals such as kids' meals) are one tap away. The toggle only appears once at least one household is flagged." },
    { "type": "feature", "text": "Meal-choice breakdown on the admin RSVPs page, matching the dashboard card and following the active wedding-party filter, with a \"No meal selected\" line so it reconciles against the attending-guest count." },
    { "type": "improvement", "text": "Admin sidebar collapses into a slide-out menu on phones instead of taking up half the screen. The notification bell moves into the mobile top bar; desktop layout is unchanged." },
    { "type": "improvement", "text": "Pending card on the admin RSVPs page now shows how many people are still undecided, matching the dashboard." }
  ]
}
```

---

## 6. Risks / edge cases

- **Stale guest IDs in `attendingGuests`** (pre-2.13 household edits): `countRsvpPeople` still counts them as attending (unchanged, shown as "N removed guests"); `countMealChoices` must not count their meals (no live `Guest` row). Attending may then exceed meals — the "No meal selected" residual is the correct presentation. Do not change people-count semantics here.
- **Numeric-fallback RSVPs** (`attendingGuests` null): no roster to intersect; count live-ID meals as today. Do not cap meals at `guestCount`.
- **Empty-name plus-ones with a meal:** writes already drop unnamed slots; read side must ignore them too so old rows cannot inflate meals.
- **Admin PUT now rejects** "attending with zero attendees" and plus-ones above allowance (the public form already did). The modal must show the error; never clamp silently.
- **Change-log rows keep historical leftovers.** Do not rewrite logs; the snapshot for *new* saves records the pruned map.
- **No flagged households:** toggle hidden and scope forced to `'all'` — never render an empty page because of a stale scope.
- **Drawer vs modal:** the RSVP detail modal is `z-50` and can open over the `z-40` drawer; fine.
- **Two bells mounted:** two unread polls; accepted.
- **Login page** is outside the authenticated layout — no hamburger there, correct.
- **Browser verification** (reviewer): dashboard meal card; RSVPs scope + meal card + pending subtitle; drawer at 375px and static sidebar at 1280px; group collapse still persists.

## Out of scope (deliberate)

Dashboard wedding-party filter; schema/migrations/backfill; feature flag; `package.json` bump / docker publish; changing `countRsvpPeople` stale-ID behavior; treating a kids' meal as a first-class type (it is just an `RsvpOption` choice name).
