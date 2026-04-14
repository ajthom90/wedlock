# Fifteen-Feature Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship fifteen wedding-site features that the bride and groom would realistically want, grouped into four phases by scope. Features range from 30-minute admin tweaks to multi-day interactive builds.

**Architecture:** Most features follow an established pattern in this codebase — add columns to an existing Prisma model or create a new one, expose a CRUD API route, render an admin page mirroring `/admin/events` or `/admin/gifts`, and add a public-facing view where relevant. Phase 4 features (live photo wall, Mad Libs / trivia) need more interactive pieces and are explicitly scoped as follow-ups.

**Tech Stack:** Next.js 14 App Router, Prisma + SQLite, TypeScript, Tailwind CSS, `@dnd-kit`, Tiptap, isomorphic-dompurify.

---

## Phase 1 — Quick Wins (ship today)

Small additions, each fits into an existing admin surface.

### Feature 1.1: Dietary summary export on /admin/rsvps

**Goal:** One-click copy of every guest's dietary restriction, formatted for the caterer.

**Files:**
- Modify: `src/app/admin/(authenticated)/rsvps/page.tsx`

**Tasks:**
- [ ] Add a "Copy dietary summary" button above the RSVP list.
- [ ] Clicking it aggregates `dietaryNotes` from every RsvpResponse that has one, formats as `"{guest name}: {dietary notes}"` lines, and copies to clipboard via `navigator.clipboard.writeText`.
- [ ] Show a transient "Copied" confirmation.

No schema changes. Build time: ~20 min.

### Feature 1.2: Non-RSVP'd list + copy emails on /admin/rsvps

**Goal:** At a glance see who hasn't responded; copy their emails to paste into a reminder mail.

**Files:**
- Modify: `src/app/admin/(authenticated)/rsvps/page.tsx`
- Modify (if needed): `src/app/api/rsvps/route.ts` to include invitation email

**Tasks:**
- [ ] Collapsible "Not yet responded" card above the RSVP list.
- [ ] Lists invitation households (name + email) where no RsvpResponse exists.
- [ ] "Copy emails" button collects all non-null emails, comma-separated, to clipboard.

No schema changes. Build time: ~30 min.

### Feature 1.3: Weather forecast widget on homepage

**Goal:** In the final week before the wedding, show the forecast under the countdown.

**Files:**
- Create: `src/components/public/WeatherForecast.tsx`
- Modify: `src/app/(public)/page.tsx` (render the component)
- Modify: `src/lib/settings.ts` (add optional `venueLat`, `venueLng`)
- Modify: `src/app/admin/(authenticated)/settings/page.tsx` (add fields)

**Tasks:**
- [ ] Add `venueLat: string` and `venueLng: string` to `SiteSettings` (string to allow empty). Default `''`.
- [ ] Admin Settings → Couple Information card gets two inputs labeled "Venue latitude" / "Venue longitude" with helper text pointing to Google Maps "right-click → What's here?".
- [ ] `WeatherForecast` client component: props `{ date: string; lat: string; lng: string }`.
  - On mount, if date is within the next 7 days and lat/lng are set, fetch `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`.
  - Render temp high/low + WMO code → icon + label mapping.
  - Handle fetch errors and "too far out" cases silently (render nothing).
- [ ] Wire into homepage below the countdown.

No new deps (uses native fetch). Build time: ~45 min.

### Feature 1.4: Vendor contacts directory

**Goal:** Private admin-only rolodex for photographer, DJ, florist, officiant, etc.

**Files:**
- Modify: `prisma/schema.prisma` (new model)
- Create: `src/app/api/vendors/route.ts`
- Create: `src/app/api/vendors/[id]/route.ts`
- Create: `src/app/admin/(authenticated)/vendors/page.tsx`
- Modify: `src/components/admin/AdminNav.tsx` (add nav entry)

**Schema:**
```prisma
model VendorContact {
  id        String   @id @default(uuid())
  name      String
  role      String   // photographer, DJ, florist, etc.
  phone     String?
  email     String?
  website   String?
  notes     String?
  order     Int      @default(0)
  createdAt DateTime @default(now())
}
```

**Tasks:**
- [ ] Add model to schema, run `prisma db push` + `prisma generate`.
- [ ] CRUD API routes (POST/GET list, PUT/DELETE individual), gated by `isAuthenticated()`.
- [ ] Admin page modelled on `/admin/events`: table of vendors with edit/delete, "Add Vendor" modal.
- [ ] Nav entry: `{ href: '/admin/vendors', label: 'Vendors', icon: '📇' }`.

Build time: ~1 hour.

---

## Phase 2 — Small-Medium (next session)

Each needs a small schema change plus admin + public UI.

### Feature 2.1: Guest address collector

**Goal:** Collect mailing addresses during RSVP for save-the-date, invitations, and thank-you cards.

**Files:**
- Modify: `prisma/schema.prisma` (add address to Invitation)
- Modify: `src/app/api/invitations/*` (accept address)
- Modify: `src/app/(public)/rsvp/*/page.tsx` (collect)
- Modify: `src/app/admin/(authenticated)/invitations/page.tsx` (show + export)

**Schema addition:**
```prisma
model Invitation {
  ...
  address String?  // free-form mailing address
}
```

**Tasks:**
- [ ] Add `address` to Invitation, push + generate.
- [ ] At the end of the RSVP flow, add an optional step: "Mailing address (for save-the-date and thank-you cards)" with a multiline textarea. Save on submit.
- [ ] Admin invitations page: show address in the row. Add "Export addresses" button that downloads a CSV of name, address for all invitations with an address set.

Build time: ~2 hours.

### Feature 2.2: Thank-you linker

**Goal:** Link a tracked gift to the invitation it came from, so the thank-you note auto-suggests the recipient.

**Files:**
- Modify: `prisma/schema.prisma` (add invitationId FK to GiftItem)
- Modify: `src/app/api/gifts/*` (accept invitationId)
- Modify: `src/app/admin/(authenticated)/gifts/page.tsx`

**Schema addition:**
```prisma
model GiftItem {
  ...
  invitationId String?
  invitation   Invitation? @relation(fields: [invitationId], references: [id], onDelete: SetNull)
}

model Invitation {
  ...
  gifts GiftItem[]
}
```

**Tasks:**
- [ ] Schema change + regenerate.
- [ ] Gift edit modal: add "Linked invitation" dropdown (select from all invitations).
- [ ] Gift card shows "From: {householdName}" when linked.
- [ ] Next to "Thank You Sent" checkbox, add a subtle "✉ Generate note" button that opens a prefilled mailto (or just opens a textarea with template text) using the linked household name.

Build time: ~2 hours.

### Feature 2.3: Budget tracker

**Goal:** Admin-only expense log with estimated vs actual vs paid totals.

**Files:**
- Modify: `prisma/schema.prisma` (new model)
- Create: `src/app/api/budget/route.ts`
- Create: `src/app/api/budget/[id]/route.ts`
- Create: `src/app/admin/(authenticated)/budget/page.tsx`
- Modify: `src/components/admin/AdminNav.tsx`

**Schema:**
```prisma
model BudgetItem {
  id          String   @id @default(uuid())
  category    String   // Venue, Catering, Flowers, etc.
  description String
  estimated   Float    @default(0)
  actual      Float    @default(0)
  paid        Boolean  @default(false)
  notes       String?
  order       Int      @default(0)
  createdAt   DateTime @default(now())
}
```

**Tasks:**
- [ ] Schema + CRUD API.
- [ ] Admin page: table grouped by category with per-category subtotals; top-of-page summary card: total estimated / total actual / total paid / remaining.
- [ ] Nav entry: `{ href: '/admin/budget', label: 'Budget', icon: '💵' }`.

Build time: ~2-3 hours.

### Feature 2.4: Day-of itinerary (guest timeline view)

**Goal:** The existing Events page but rendered as a vertical visual timeline for guests.

**Files:**
- Modify: `src/app/(public)/events/page.tsx`

**Tasks:**
- [ ] Add an admin setting `eventsDisplayStyle: 'list' | 'timeline'` (default `list` for back-compat).
- [ ] In timeline mode: vertical line down the page, each event as a card off-aligned with its time as a big label. Handle multi-day events.
- [ ] Keep the existing list style selectable so couples that prefer it can.

No new schema. Build time: ~2 hours.

---

## Phase 3 — Medium (following session)

Public-facing features with meaningful surface area.

### Feature 3.1: Honeymoon fund

**Goal:** Alternative to gift registry — guests pledge a contribution toward specific honeymoon experiences. Couples record actual receipts later; no real payment processing.

**Files:**
- Modify: `prisma/schema.prisma` (two new models)
- Create: `src/app/api/honeymoon/route.ts` + `[id]/route.ts`
- Create: `src/app/api/honeymoon/pledge/route.ts` (guest pledge endpoint, anonymous)
- Create: `src/app/admin/(authenticated)/honeymoon/page.tsx`
- Modify: `src/app/(public)/registry/page.tsx` (show honeymoon items)
- Modify: `src/components/admin/AdminNav.tsx`

**Schema:**
```prisma
model HoneymoonItem {
  id            String                  @id @default(uuid())
  name          String
  description   String?
  goalAmount    Float                   @default(0)
  imageUrl      String?
  order         Int                     @default(0)
  pledges       HoneymoonPledge[]
}

model HoneymoonPledge {
  id             String         @id @default(uuid())
  itemId         String
  item           HoneymoonItem  @relation(fields: [itemId], references: [id], onDelete: Cascade)
  guestName      String
  amount         Float
  message        String?
  receivedAt     DateTime?      // null = pledged only, non-null = couple recorded receipt
  createdAt      DateTime       @default(now())
}
```

**Tasks:**
- [ ] Schema + regen.
- [ ] Admin page: CRUD for items; per-item list of pledges; "mark received" action that sets `receivedAt`; progress bar showing sum(pledges.amount) vs goalAmount.
- [ ] Public item cards with "Contribute" button that opens a form (name / amount / message). POST to `/api/honeymoon/pledge`. Show thank-you confirmation.
- [ ] Integrate with `/registry` — toggle between "Registry Links" and "Honeymoon Fund" via tabs.

Build time: ~5 hours.

### Feature 3.2: Transportation coordination

**Goal:** Shuttles from hotel to venue. Guests sign up for a seat.

**Files:**
- Modify: `prisma/schema.prisma` (two models)
- Create: `src/app/api/shuttles/route.ts` + `[id]/route.ts`
- Create: `src/app/api/shuttles/signup/route.ts` (invitation-gated)
- Create: `src/app/admin/(authenticated)/shuttles/page.tsx`
- Create: `src/app/(public)/transportation/page.tsx`
- Modify: `src/app/(public)/layout.tsx` (nav entry)

**Schema:**
```prisma
model Shuttle {
  id          String          @id @default(uuid())
  name        String          // "Friday hotel → venue"
  departDate  String          // ISO date
  departTime  String
  origin      String
  destination String
  capacity    Int             @default(0)  // 0 = unlimited
  notes       String?
  order       Int             @default(0)
  signups     ShuttleSignup[]
}

model ShuttleSignup {
  id           String     @id @default(uuid())
  shuttleId    String
  shuttle      Shuttle    @relation(fields: [shuttleId], references: [id], onDelete: Cascade)
  invitationId String
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  guestCount   Int        @default(1)
  createdAt    DateTime   @default(now())
}

model Invitation {
  ...
  shuttleSignups ShuttleSignup[]
}
```

**Tasks:**
- [ ] Schema + regen.
- [ ] Admin CRUD for Shuttles; per-shuttle list of signups (name + count).
- [ ] Public `/transportation` page: gated by invitation code cookie (like `/events` was). Shows shuttle list with remaining seats = capacity - sum(signups.guestCount). Per-shuttle signup form with +/- counter.
- [ ] Add "Transportation" to main nav.

Build time: ~4 hours.

### Feature 3.3: "How you met" timeline

**Goal:** A visual timeline of relationship milestones, rendered on `/our-story`.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/milestones/route.ts` + `[id]/route.ts`
- Create: `src/app/admin/(authenticated)/story-timeline/page.tsx`
- Modify: `src/app/(public)/our-story/page.tsx` (render timeline)
- Modify: `src/components/admin/AdminNav.tsx`

**Schema:**
```prisma
model StoryMilestone {
  id          String   @id @default(uuid())
  date        String   // display-friendly, not strict (e.g. "Summer 2019")
  title       String
  description String?
  imageUrl    String?
  focalX      Int      @default(50)
  focalY      Int      @default(50)
  zoom        Float    @default(1.0)
  order       Int      @default(0)
}
```

**Tasks:**
- [ ] Schema + regen.
- [ ] Admin page: drag-to-reorder (dnd-kit) milestone cards; each card editable in place with optional image + focal point editor (reuses `FocalPointEditor`).
- [ ] Public render: alternating left/right card layout on desktop, stacked on mobile, with vertical connecting line and pulse markers at each milestone.

Build time: ~4 hours.

---

## Phase 4 — Large (dedicated session each)

### Feature 4.1: Live photo wall

**Goal:** QR code at reception links guests to an upload page. Gallery on a big screen live-updates as new photos come in. Integrates with the existing GuestPhotoUpload flow.

**Files (high-level):**
- Modify: `prisma/schema.prisma` (optional new `PhotoWall` or tag existing Photo with `isGuestUpload`)
- Create: `src/app/wall/page.tsx` (full-screen rotating gallery)
- Create: `src/app/wall/upload/page.tsx` (mobile upload)
- Create: `src/components/public/QrForWall.tsx`
- Polling or SSE for live updates

**Tasks:** Write a dedicated sub-plan for this; needs decisions about moderation (auto-approve vs review queue), TV aspect ratios, offline queuing, etc.

Build time: ~8 hours.

### Feature 4.2: Mad Libs / trivia

**Goal:** Interactive game guests can play on their phones during the reception.

**Files (high-level):**
- Modify: `prisma/schema.prisma` (TriviaQuestion, TriviaResponse, or MadLibsTemplate)
- Admin CRUD for question/template authoring
- Guest game UI (single-page app with answer validation)
- Optional: live scoreboard

**Tasks:** Write a dedicated sub-plan. Scope decisions: trivia OR mad libs OR both? Individual play or live multiplayer?

Build time: ~6-10 hours.

---

## Phase Dependencies

- Phase 1 is independent — no features depend on each other.
- Phase 2's thank-you linker depends on Gifts being in place (already is).
- Phase 3's honeymoon fund is tabbed with registry links (already consolidated onto `/admin/gifts`). Transportation depends on invitation code cookie (already implemented for `/events`).
- Phase 4 features stand alone; live photo wall may cannibalize existing `guestPhotoUpload` feature — decide whether to merge or keep separate.

## Execution Advice

- **Within a phase:** implement features serially, one commit per feature, `bump-patch` at the end of the phase (not per-feature) to keep registries clean.
- **Between phases:** run full `npm test && npx tsc --noEmit && npm run build` before moving on.
- **Before shipping Phase 3/4:** review admin nav ordering — it'll have 20+ entries. Consider grouping (Content / Guests / Event / Money / Playing With Fire).
