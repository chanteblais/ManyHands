# Feature Map

---

## Navigation

The site uses a single shared `Header` component (`components/HeaderClient.tsx`) on all pages. Nav links switch based on auth + approval state.

**Unauthenticated / not approved:**
```
Glåüm   About · Participate · Schedule · Apply     [Sign in]
```

**Approved members:**
```
Glåüm   Schedule · Radio · Many Hands · Messages · Participate · My Profile   [🔔 avatar▾]
```

- `Messages` shows an unread count badge (polled every 30s via `/api/messages/unread` — `useUnreadMessages` in `MessagesNavLink.tsx`; ONE module-level poller shared by every badge instance, paused while the tab is hidden)
- Avatar dropdown: Admin link (admin only) + Sign out
- Mobile, public/pending visitors: hamburger menu with the same contextual links
- **Mobile, approved members: bottom tab bar** (`components/MobileTabBar.tsx`, rendered by `HeaderClient` under the JS `<768px` breakpoint) — the *same* member nav list (one product, one IA: `memberNavLinks` drives both renderings), as icon tabs (regal icons via `IconImage`: gathering / raised-hand / envelope / signpost / vintage-radio / hand-mirror), active tab marked with the desktop underline's gradient+dot moved to the tab's top edge, Messages badge included. The hamburger stays as overflow only (name, About, Admin, Sign out). Hidden on `/admin` (admin is a web/desktop workspace) and for non-members. The bar injects `body { padding-bottom }` (+ `env(safe-area-inset-bottom)` for the PWA) so page ends and the Footer stay reachable.

Nav links for non-approved signed-in users (pending/rejected) show the public set — `/apply` is the only meaningful destination for them.

---

## Public Pages

### Homepage (`/`)

**Who:** Anyone (public view) / Approved members (dashboard view)  
**What:** Two distinct experiences depending on auth state.

**Public (not signed in):**
- TokyoDreams display heading + camp logo
- Hero tagline (`home_tagline` from `page_content`)
- Embedded public schedule (`ScheduleSection` + `ScheduleCalendarClient`)
  - Mobile: day-tab switcher (< 768px)
  - Desktop: 6-column grid
- About + Participate sections (editable via Admin → Edit Page)
- Footer with hands SVG decorations

**Member dashboard (approved + signed in):**

Fixed top sections (always present, not reorderable):
1. **Hero banner** — welcome greeting, countdown to event, hero tagline (`home_tagline`, editable inline)
2. **Attunement + Commitments** — side-by-side (`dash-grid`)
3. **Attunement banner** (renders only while actionable): card with the eye-in-triangle ornament, named outstanding required tasks (first 3 + "+n more"), a done/total progress bar, and a pill CTA → `/profile`. When required tasks are done but commitments remain, a gentler variant (no bar, "View commitments") shows instead. On mobile (<680px) it collapses to one compact row — small icon · "Attunement" · count ("X OF Y", or "N COMMITMENTS" when attuned) · chevron — task names, bar, and pill hidden

Configurable widgets (order, visibility, and width controlled by admin via the page editor):

| Widget ID | Default label | Content |
|---|---|---|
| `announcements` | Announcements | Visible, non-expired admin announcements; pinned first. Hidden if empty |
| `resources` | Bring Something | "What does the community still need from me?" — a **compact index: one row per list** opted into the dashboard (`show_on_dashboard`, migration `070`), each with a right-aligned status ("3 still needed" / "✓ all covered" / "N being brought" / "✦ open call" for a list with no tracked needs — such open-call lists also show their description as an italic callout line, the invitation in the list's own words), an overall **% Ready** header, a **personal line** ("You're bringing Camping Stove ×2 — thank you ✦" / "You haven't committed anything yet"), capped at 6 rows + "+N more lists". The **whole card** links to `/participate#bring` (`getResourceWidgetState` in `lib/resources.ts`, untargeted contributions never gate readiness). **Opt-in** (default off): hidden entirely until a member flags a list for the dashboard in its list editor |
| `shoutouts` | Shoutouts | Member-posted shoutouts (newest first). Approved members post via a "✦ Share a shoutout" button at the bottom that opens an inline composer; authors and admins can delete (✕). See **Shoutouts** under Supporting Features |
| `polls` | Polls | Active, non-expired admin polls. Members vote inline (approved members only; option indexes validated server-side); results visible to everyone (voted or not) |
| `events` | Upcoming Gatherings | Pre-camp + at-camp `schedule_events` in the next 14 days. "View full schedule →" links to `/schedule` |
| `spotlight` | Meet a Member | Left: rotating member spotlight (cycles every minute). Right: Upcoming Gatherings list |
| `activity` | On the Air | The latest 6 **Radio** events with a "Tune in →" link to `/radio` (replaced the old member-joins/profile-updates feed — joins now *are* Radio events). See **Radio** under Authenticated Member Pages + [radio.md](radio.md) |

Fixed bottom section (always present):
- **Role & Shift + Many Hands** — quick-link grid to `/participate` and `/members`

**Widget layout:** widgets wrap in a flex row; each is full (default), half, third, or two-thirds wide (consecutive widgets pair side by side when their widths fill a row — ½+½ or ⅓+⅔). All revert to full width on mobile.

**Dashboard layout** is stored as `dashboard_layout` JSON in `page_content`:
```json
{ "order": ["announcements","resources","shoutouts","polls","events","spotlight","activity"], "hidden": [], "widths": {} }
```

Admin-only: **"✎ Edit Page"** floating button (bottom-right). Clicking enters inline edit mode:
- A top bar appears: `Editing · [+ Poll] [Edit Text] [Save] [✕]`
- All widgets get a gold dashed outline
- Hovering a widget reveals a `⠿ Label [½]` handle in its top-right corner
- **Drag the handle** to reorder widgets — the card physically follows the cursor (`position: fixed`) while a dashed placeholder holds the drop slot
- **Click the width button** on the handle to cycle full → half → third → two-thirds (updates live on the page before saving)
- **Drop a widget beside another** and it takes the complement of its neighbour's width so the pair fills the row (beside a ⅓ → becomes ⅔; beside a ½ or full → both become ½)
- **Click a gold-underlined text element** (e.g. the hero tagline) to edit it inline (`contenteditable`)
- **`+ Poll`** — opens a slide-in panel to create a new poll
- **`Edit Text`** — opens a slide-in panel for copy fields not visible on the dashboard (quote card, About, Participate)
- **`Save`** — writes new order + widths + any text edits to `page_content` and reloads

---

### Apply (`/apply`)

**Who:** Prospective camp members  
**What:** Multi-step application wizard (`ApplyWizard`) driven by the form config stored in `page_content` (`config_member_form`).

**States:**

| State | Condition | What's shown |
|---|---|---|
| Track picker | Signed in, no application | Choose Member or Volunteer track |
| Wizard | `?track=member` | 6-step (or more) multi-step form |
| Applications closed | `config.open === false` | Closed message |
| Pending / Rejected | `application.status` is `pending` or `rejected` | Redirect to `/profile` |
| Approved | `application.status === 'approved'` | Redirect to `/profile#role-signup` |

**Admin preview:** `?track=member&admin_preview=1` lets admins preview the form even when they already have an approved application. Bypasses redirect checks.

**Wizard steps (default):**

| Step | Key | Title |
|---|---|---|
| I | `basic` | Basic Information |
| II | `registry` | Many Hands Registry |
| III | `plans` | What If Plans |
| IV | `roles` | Participation & Roles |
| V | `agreement` | The Many Hands Agreement |
| VI | `shrimp` | Shrimp |

Steps and fields are fully configurable via the Application Builder (`/admin/configure`). Admin-added custom sections and fields are also supported. Custom field answers are submitted as `custom_answers` (JSONB) alongside the standard fields.

The form config is read fresh from `page_content` on every load — no caching. Step numerals (I, II, III…) are derived from position, not stored.

---

### Schedule (`/schedule`)

**Who:** Approved members  
**What:** Full public camp schedule — same `ScheduleSection` + `ScheduleCalendarClient` as the public homepage, wrapped in the member layout with the shared nav. On the calendar, recurring events with picked days (`recurrence_days`) render as blocks in those day columns; only true every-day recurring events sit in the "✦ Every Day ✦" card section below the grid. General events each wear a stable hue of their own (`generalHue(event.id)` — hashed, disjoint from shift-type colours; the Every Day cards carry the same hue on their border + time label), and events with `show_on_schedule` off are absent here entirely. The grid's hour window derives from the events' actual times; overnight events ("11:00 PM – 2:00 AM") wrap past midnight and extend the grid's bottom rather than dragging its start back to early morning. **After-midnight events follow the late-night convention** (`lib/late-night.ts`, added 2026-07-16): a dated event starting before 6 AM keeps its TRUE calendar date in `event_date` (reminder emails, the radio Now strip, and shift occurrences do real-datetime math on it) but *displays* in the **previous night's column**, drawn past the Midnight line — a "1:00 AM" afterparty dated Sunday sits at the end of Saturday's column, where the eye looks for it (it previously rendered at the top of Sunday's column, hours from its night, and dragged every column's start back to Midnight — reported as "events after 12 AM aren't showing"). Its Event Details card is labelled "*<weekday>* night". Recurring events have no date of their own: each picked day chip already means *the night of* that day, so a late-night recurring event keeps its chip's column and just renders past midnight. A dev sandbox at `/dev/schedule` (404 in production) renders the live calendar plus synthetic late-night rows for checking this without touching real data. Accessible via the Schedule nav link or "View full schedule →" / "View full calendar →" links on the dashboard.

---

### Volunteer (`/volunteer`)

**Who:** People who want to help but aren't applying as members  
**What:** Single-page signup form (`VolunteerForm`) driven by the volunteer form config stored in `page_content` (`config_volunteer_form`).

Collects name, contact info, pronouns, photo, signup intent, days available, and notes. All fields are configurable via the Application Builder. If `config.open === false`, shows a "Volunteer Signup Closed" screen instead.

Volunteers are **self-serve for shifts, admin-coordinated for everything else** (2026-07-16 — picking shifts is the whole point of volunteering). An **active** volunteer signs in and picks shifts on `/participate`, which renders a **shifts-only variant** for them ("Lend a Hand" heading — the shift plaque already carries the "Your Shifts" kicker, UX 2026-07-20 #30; `SignupSection` with `hideRole` — no role picker, no groups, no shared resources, and no owed-hours chips since hour requirements are a member concept). The signup APIs gate on `getShiftParticipant` (approved member **or** active volunteer, `lib/members.ts`); pending/cancelled/removed volunteers still can't sign up. Their entry point is the **"✦ Pick your shifts"** button on their own `/profile` (volunteers get the public nav, not the member nav). The signup-form intents (shift / role / other) and shift interests remain interest *signals* on the admin rows. A new volunteer signup awaits approval in the admin **Applications** review queue (unified with member applications, tagged Volunteer — see Admin console table); once approved they move to Registered Hands. Someone who should hold a role (e.g. a pre-event contributor) is admitted as a regular member instead — see the volunteers→members fold planned in [generalizability-log.md](generalizability-log.md).

**Admin preview:** `?admin_preview=1` bypasses redirect checks for admins.

---

## Authenticated Member Pages

### Profile (`/profile`)

**Who:** Signed-in users with an approved application  
**What:** The member's personal hub.

The page reads like a ceremonial registry, separating three concepts: **Designation** (identity), **Active Commitments** (what they're doing now), and **Distinctions** (earned honours). Engraved medals are reserved for honours — operational info is plain, legible UI.

Sections (approved members):
- **Header** — a three-column registry band (`profile-header-grid`, `1fr auto 1fr`, within the centered content width): **Designation** (left), **portrait** (center, the focal point), **Member Information** (right). No badges live here.
  - **Designation column** — the role + department as *text*, not a medal: a brass emblem (the department `icon`/`icon_image`, else `/handicon.png`), a "DESIGNATION" kicker, the role name (`TokyoDreams`), a `── ✦ ──` divider, the role purpose/description, then the department ("Department of X" is split onto two lines) closed by a small flourish. The **role title and department name are quiet links** (`.designation-link`, underline on hover) into the Registry of Roles (`/roles#<slug>`) — no separate "read more" line, and deliberately **no commitment pill here** (Chanté: read harsh on the ceremonial column; the colour-scaled pill lives in the picker/registry where it informs choosing). Only shown when the member has an approved designation.
  - **Portrait** — `AvatarUpload` at an enlarged size (new `size` prop; 340px here vs the 260px default). Click to change photo.
  - **Member Information column** — "MEMBER" kicker, name + settings gear (`ProfileSettings`), the shared **`ApprovedCamperPill`** (`app/ApprovedCamperPill.tsx` — amethyst-glass status pill, same component the public profile uses), email, then (when the member has filled in the `quote` profile field) an italic **quote** line, then an at-a-glance **stat list** (small gold line-icons + right-aligned values, built inline in `page.tsx` via `StatRow`/`StatIcon`): Member since (`joined_year`), Active Commitments (group + held-shift + resource-claim count), Distinctions Earned (count), Attunement Status (Fully Attuned / N left).
- **About** — a centered card shown when the member has filled in the `bio` profile field, rendered via `RichText` (`lib/markdown-lite.tsx`). Sits at the top of the approved body. Read-only presentation; the value is edited in the Profile Details card below.
- **Active Commitments** (`CommitmentsSection.tsx`, left card) — the member's groups + **all held shifts** (many-to-many, real-date labels from `event_date`) + **shared-resource claims** (`BRINGING` rows, "Camping Stove ×2 · Shared Kitchen" — see [Shared Resources](#shared-resources)) as legible list rows: circle icon, title, one-line description, a pill (`GROUP`/`TEAM`/`SHIFT`/`LEAD`/`BRINGING`) and a chevron affordance. Rendered with the `hideRole` prop so the designation is **not** duplicated here (it lives in the header). Icon/description come from `getMemberGroups` → `groupCommitmentMeta` (`lib/groups.ts`): the row icon is the group's emoji `icon`, else its uploaded `icon_image` (rendered as a circle-filling `<img>`), else `✦`; the description falls back to the matching default contribution one-liner when the group has none. `showManageLink` (profile only) renders the centered "View all commitments ›" footer → `/participate`. (This card is `/profile`-only; the public `/members/[id]` renders its own collection-grouped **Contributions** medallions and a **Shifts** medallion card instead — see Member Profile below.)
- **Attunement Status** (`AttunementStatus.tsx`, right card) — parchment card with checklist. **Fully admin-managed** (Admin → Configure → Attunement Tasks, `AttunementTasksManager.tsx`); the list lives in `page_content.config_attunement_tasks` (JSON), parsed by `parseAttunementTasks` in `lib/site-config.ts`. Each task has a `requirement` that auto-completes it; the filtering + done/action logic lives in `buildAttunementChecklist` (`lib/attunement.ts`), the **single source of truth shared by `app/profile/page.tsx` and `app/page.tsx` (home dashboard banner)** so counts stay in sync. Honours each task's `enabled` flag and drops the `shift` task while shift signup is closed; hidden if no enabled tasks. The Commitments and Attunement cards are kept **equal height** (main grid `align-items: stretch`; each card fills the row and anchors its footer/verdict to the bottom). Requirement types (`ATTUNEMENT_REQUIREMENTS`):
  - `role` — `campSignup.role_id` set & non-pending; links to `/participate`
  - `shift` — with a `shiftTypeId` + `requiredHours`: the **universal hours requirement** — done when the member's held hours of that shift type (summed slot durations, `lib/shift-attunement.ts` `getMemberShiftState`, over `member_shift_signups` ∪ the legacy single signup) reach the target; the label shows live `X/Yh` progress. Without a `shiftTypeId` ("Any shift"): legacy boolean — holds ≥1 shift. Links to `/participate`. **Derived lines:** group/role shift requirements (`required_shift_type_id`/`required_shift_hours`) are *not* authored tasks — they're appended to the checklist automatically for members who belong (max hours on same-type overlap; role only when approved), and disappear on leaving. All shift lines hide while shift signup is closed.
  - `collection` — **membership in a group collection.** The task carries a `collectionId` (which collection; **unset = any collection**, i.e. total group count) and a `requiredCount` (how many memberships needed, default 1). Done when the member belongs to ≥ `requiredCount` groups in that collection; links to `/participate` (where members self-join). In the admin builder the requirement dropdown lists each collection under a "Collection membership" group, with a **count input capped at the number of groups in the chosen collection** (can't require more than exist). Replaces the old `contribution` requirement, which is auto-migrated on parse to an any-collection task (count 1) — identical behaviour.
  - `photo` — checks `avatar_url`; opens ProfileSettings photo
  - `approved` — always done on this page (reassuring first step)
  - `dues` — **camp dues paid** (migrations `067`/`068`). Dues are collected by email this year, so it's done when the member **self-reports** paying (`dues_reported_at`, label gains "· awaiting confirmation") **or** an admin confirms (`dues_paid_at`). Links to `/dues` (self-report + payment instructions + status). Managed in **Community → Camp Dues** (see below); a Stripe integration is a future TODO that writes the same `dues_paid_at`.
  - Default list (when key absent) mirrors the original five hardcoded items (the "Contribution Selected" default is now an any-collection membership task).
  - **Nudge emails** — a daily Vercel Cron (`GET /api/cron/attunement-nudges`, 16:00 UTC; see `docs/architecture.md` → Cron) emails each approved member their outstanding checklist at an admin-set cadence (**Reminder emails** select at the top of the Attunement Tasks manager → `config_attunement_nudge_days`: Off / Daily / Every 2 days / Every 3 days / Weekly, default every 2 days; when on, the box shows **Next run** — the cron's next fire in the viewer's local time, from `ATTUNEMENT_NUDGE_UTC_HOUR` in `lib/site-config.ts`, which must match `vercel.json`), computed per member with the same `buildAttunementChecklist` + `getMemberShiftState`/`getMemberGroups` (`lib/attunement-nudge.ts` `collectOutstandingAttunement`), so the email always matches the site. Required tasks headline the email; outstanding **commitment** items (derived group/role hours) ride along in a gentler second section — reminded, never framed as blockers. Each item deep-links via its checklist `href`; the CTA lands on `/profile`. Fully attuned members get nothing. Members opt out via **Attunement reminders** in `/profile#notifications` (`notification_preferences.email_attunement_nudges`, default ON); sends are recorded in the `attunement_nudges` ledger, **claimed before the send** (conditional update on the previous `last_sent_at`, so overlapping sweeps can't double-email; a failed send restores the claim). Template: `sendAttunementNudgeEmail` (`lib/send-email.ts`); the countdown line uses the configured event start date (`lib/camp-event.ts` `daysUntilEvent`, shared with the home banner). Migration `056`.
- **Cabinet of Distinctions** (`CabinetOfDistinctions.tsx`, full-width band below the two cards) — a centered gallery of earned **engraved medals** (honours, *not* controls — nothing is clickable). Each medal renders the distinction's `image` (from the shared asset library — a built-in or an upload) inside a CSS medal frame (gold ring + purple glow), with an uppercase label, an optional short static **engraving** caption (gold italic, ≤32 chars), and an optional dynamic year. Art is sized by height + clipped to the circle so the emblem fills the frame; built-in art should be a transparent emblem with no baked rim (the frame supplies the ring). A `glyph` emoji is the fallback when a rule has no `image`. Shown only when ≥1 is earned. Distinctions are **derived, never stored** — see [Distinctions](#distinctions) below.
- **Signup Section** (`SignupSection.tsx`) — role picker + the **multi-shift calendar picker** (see Shifts below); "Suggest a role" opens `SuggestRoleModal`. Rendered on `/participate` (Participate); `/profile` no longer embeds it (the header designation + Commitments card carry the member's current state, with links into `/participate` and `/roles`).
- **Personal Schedule** (`PersonalSchedule.tsx` → `PersonalScheduleCalendar.tsx`) — **mandatory events** (`participation_type='mandatory'`, everyone) + the **shifts the member holds** (`member_shift_signups` ∪ legacy single signup, deduped). Day columns derive from the events' real dates (`lib/schedule-days.ts`); after-midnight events follow the same late-night convention as `/schedule` (`lib/late-night.ts` — shown at the end of the previous night's column); cards are coloured by shift-type hue (`lib/shift-colors.ts`). "View full calendar →" → `/schedule`.
- **Confirmation & reminder emails (gatherings + shifts)** — signing up sends an **immediate confirmation** (`sendSignupConfirmationEmail`): a fresh lead-up RSVP (`POST /api/lead-up-events/[id]/rsvp`) and a fresh shift hold (`POST /api/shift-signups`) each fire one, best-effort (never blocks the signup). Then two **reminders** — the **evening before** and the **morning of** — go out via the `event-reminders` cron (see [architecture.md](architecture.md) → Cron; `lib/event-reminders.ts`), **batched into one email per member per phase** listing every gathering + shift that day. All of it (confirmations + reminders) is governed by one member toggle, **Gathering & shift reminders** in `/profile#notifications` (`notification_preferences.email_event_reminders`, default ON); suspended/non-approved members are skipped. Migration `066`.
- **Profile Details** (`ProfileDetails.tsx`, client) — an editable card for the member's registry-defined detail fields (bio, quote, and any admin-added custom fields) over `member_profiles.values` — fields+values are server-rendered by the page (`initialFields`/`initialValues`, no mount fetch); writes go through `PATCH /api/profile/fields` (its GET survives as the no-prop fallback). Only shows fields that are **Visible** (`public`) or member-editable; admin-only fields (not Visible) never appear here — they surface on `/admin/[id]`. Renders nothing until the registry has such fields. The fields are defined in the Profile Field registry (Admin → Configure → **Profile Fields**, `ProfileFieldsManager`); see [profile-architecture.md](profile-architecture.md).
  - **Gentle completion nudge (`ProfileNudge.tsx`):** a soft purple/gold banner at the **top** of the approved profile ("*One more detail / N details would round out your profile*") with **Add now →** (scrolls to this card + focuses the first field). Empty fields flagged for catch-up drive it; an empty **About** (Bio) is nudged **by default** — no admin setup — so a bare profile always gets one gentle prompt. Each gap field is marked **Optional** / **Required** here in the card so it's easy to find. Two-tier dismissal: **Not now** snoozes for the browser session (returns next visit), **Don't ask again** permanently dismisses the optional gaps (`member_profiles.values.__dismissedFields`). Kept **profile-only** by design (off the dashboard, to stay non-intrusive). See [profile-architecture.md](profile-architecture.md) → Phase 4.5.
- **Settings** — gear icon opens `ProfileSettings` (edit profile fields, avatar). Groups are admin-assigned, so not edited here. The menu also offers **Suspend / Resume attendance** and **Cancel attendance**:
  - **Suspend attendance** (migration `063`, `POST /api/profile/suspend`) — a member who's unsure they can commit can pause: a warning panel explains they'll be released from all their commitments (role, groups, shifts, and anything they're bringing) and can't take on new ones until they resume, while keeping full access to the site. Sets `members.suspended_at` and releases commitments (`lib/suspension.ts`); admins are notified. A suspended member sees an **"Attendance paused"** notice on `/profile` and the home dashboard (in place of the attunement nudge), and **Resume attendance** lifts the flag (nothing auto-restored — rejoin from Participate). Suspended members are excluded from Overview participation counts + attunement nudge emails.

Max content width: `1100px`. Layout uses CSS classes (`profile-main-grid` [`1.1fr 1fr`, equal-height], `profile-info-grid`, `profile-header-grid`) for responsive behavior; under 768px the header stacks portrait → identity → designation.

**Custom event:** `ProfileSettings` listens for `glaum:open-settings` dispatched by `AttunementStatus` when member clicks an incomplete item.

---

### Registry of Roles (`/roles`)

**Who:** Approved members only (redirects others to `/profile`; signed-out → `/sign-in`)
**What:** The permanent, readable home for every department and role — the documentation the signup picker links into. One scrollable page, no accordions.

- **Department sections** — emblem in a brass ring, department name (`TokyoDreams`), italic description, `── ✦ ──` divider; a **department chip rail** at the top jumps to each section. Departments with no roles are omitted.
- **Role entries** — each an anchored card (`/roles#<slug>`, slugs derived from names by `roleSlug` in `lib/role-slug.ts` — never stored): role name, **commitment pill**, live **capacity pill** (`N of M open` / `Full`), "Approval required" pill where relevant; then the full charge — purpose, **Before/During the event** ✦-lists (two columns ≥640px), *Ideal for*. The member's own role is highlighted gold.
- **Claim in place** (`ClaimRoleButton.tsx`, client) — each entry ends with **Claim this role** (or **Request this role** when `requires_approval`), a two-step inline confirm that POSTs the same `/api/signup` the picker uses, then `router.refresh()`. Current role shows "✦ Your role" (or "Requested — pending approval"); full roles show "Full".
- Server component; reads `departments`/`roles`/`camp_signups` via `supabaseAdmin` directly (no new API route). Deep-linked from the signup picker's role modal, the "Your Role" card, and the profile designation ("Read your full charge ✦").

**Key files:** `app/roles/page.tsx`, `app/roles/ClaimRoleButton.tsx`, `lib/role-slug.ts`

---

### Member Directory (`/members`)

**Who:** Approved members only (redirects others to `/profile`)  
**What:** Grid of approved member cards, plus a distinct **Volunteers** section below.

Each card shows: circular avatar (gold border), display name, and role name if assigned and approved (gold small-caps). Members without an avatar show a `✦` glyph rather than an initial.

**Equal-height cards (load-bearing):** the role text is always rendered (just hidden when absent) and the grid/flex setup forces uniform card heights across rows. Don't "clean up" the empty role line — it's intentional, removing it makes rows ragged.

**Volunteers section:** `active` rows from `volunteers` render under a purple "VOLUNTEERS" rule with the descriptor "not full camp members". Cards match the member cards (same outline + avatar ring — deliberate, per 2026-07-09 feedback: no "othering" borders); the distinction is the section itself plus a purple "Volunteer" tag where a member's role sits. Cards **link to `/members/[volunteer-uuid]`**, which renders the volunteer variant of the public profile. Anyone who is both an active volunteer and an approved member is deduped (matched by `clerk_user_id` or email) and shows only as a member. The text search covers volunteers by name (searching "volunteer" also lists them all); the department/role filters are member-only concepts and hide the section while active. The heading count reads "N approved members · M volunteers".

Linked from nav as "Many Hands".

---

### Member Profile (`/members/[id]`)

**Who:** Approved members  
**What:** View another member's public profile — a ceremonial registry page with its **own** layout (not the same components as your own `/profile`).

- Lookup by `clerk_user_id` (default) or UUID.
- **Hero:** circular portrait beside the identity block — name, pronouns, "Member since", quote, the shared **`ApprovedCamperPill`** (`app/ApprovedCamperPill.tsx`, amethyst-glass status pill), and a **"✉ Message"** button (→ `/messages/[clerk_user_id]`, with a hover lift via `.pub-msg-btn`).
- **About:** the member's `bio` rendered as plain **left-aligned narrative text (no card)**, inset under the hero.
- **Roles & Responsibilities** (card): department + primary role, plus supporting roles, as medallion rows (`DetailRow` / `IconMedallion`).
- **Contributions** (card): the member's group memberships, **grouped under each collection's name** (only collections with `show_on_profile`), laid out **inline with a soft vertical divider** between collections and wrapping to its own row when they don't fit (`groupByCollection` + `ColHeading` + `IconMedallion`). Each group's medallion is its emoji `icon` / uploaded `icon_image` / `✦`.
- **Shifts** (card): every shift the member holds (`member_shift_signups`, same source as their own commitments card), one medallion per shift event (`ShiftMedallion` — `icon_type` image via `IconImage`, built-in glyph via `EventIcon` in gold) with the shift title, the **night(s) held** (`occurrence_date` per signup, falling back to `event_date`; one night reads long "Saturday, July 25", several read short joined by ✦), the display `time`, and a purple **✦ Lead** marker when they've offered to lead. Night labels follow the **late-night convention** (`lib/late-night.ts` `displayPlacement`): a shift starting before 6 AM lists under the previous night with a "· late night" tag after its time. Sorted by first night; omitted when they hold none.
- **Distinctions:** `CabinetOfDistinctions` (compact) — earned medals, derived.
- **Profile** + **Skills & Gifts:** public registry fields (see [profile-architecture.md](profile-architecture.md)).
- Read-only; no editing controls.
- **Volunteer variant:** a UUID that misses `applications` falls through to `volunteers` (`status = 'active'`; `VolunteerProfile` in the same file). Hero (same portrait/name/pronouns register, "Volunteering since {year}" from `created_at` — `volunteers` has **no** `submitted_at`; assuming it does is what 404'd the page in `bc68877` — a one-line descriptor, the shared pill relabelled via its `label` prop `<ApprovedCamperPill label="VOLUNTEER" />`) **plus the same Shifts card members get** (volunteers hold shifts too — their whole contribution register; `buildHeldShifts` + `ShiftsSection`, shared with the member branch). No roles/groups/distinctions sections (volunteers have none) and no Message button (DM threads are member-keyed).

---

### Messages (`/messages`)

**Who:** Approved members  
**What:** Inbox listing **direct conversations and group threads** together, most recent first.

- Each row shows an avatar (or the **group's icon** for group threads — uploaded `groups.icon_image` art via `IconImage`, else the emoji `icon`, else `✦`; same precedence as the profile Commitments card), display name, last message preview, timestamp, and unread count badge. Group rows link to `/messages/g/[groupId]`; DM rows to `/messages/[userId]`.
- **Filter tabs — All / Direct / Groups** (shown only when you have both kinds), each with its own unread badge so groups don't get buried under DMs.
- **Group threads always appear** for groups you belong to — even with no messages yet (an entry point: "Nothing said yet — the first word is yours"). Direct conversations appear only once they have messages.
- **"✉ New Message" button** (top-right) opens a searchable member picker modal for **DMs**. **"✦ Find a group"** (beside it) opens a picker of **open, listed** groups you can self-join (`/api/groups/joinable` → `/join`); admin-assigned groups still appear automatically once you're a member.
- **Muted** group threads show a 🔕 and never badge.
- Conversations come from `/api/messages`, backed by the conversations model (`lib/conversations.ts`); group membership is derived from `group_members`, profiles/group names enriched server-side.
- **Deleted members:** DM conversations with a member whose application was removed still appear; their name falls back to the `messages.sender_name` snapshot, or "Member" if none.

---

### Message Thread (`/messages/[userId]`)

**Who:** Approved members  
**What:** Full conversation thread with another approved member.

- Sticky header: back arrow (→ `/messages`), avatar + name (links to `/members/[id]`)
- Message bubbles: sent messages right-aligned (purple tint), received left-aligned (gold tint)
- Timestamps shown when gap between messages > 5 minutes
- Compose area: auto-expanding textarea, 2,000 char limit with counter (shown at 80% full), Enter to send / Shift+Enter for new line
- Polls for new messages every 12 seconds (skipped while the tab is hidden; catches up on visibility)
- Auto-scrolls to bottom on new messages
- Messages from the other person are marked read on page load (via `GET /api/messages/[userId]`)
- **Deleted/inactive other member:** if their application is gone, the page no longer 404s — it renders the thread **read-only** (only when message history exists; otherwise still 404). The header shows their snapshot name (`messages.sender_name`, or "Former member") with a "No longer active" note and is **not** linked to `/members/[id]`; the composer is replaced with a "can't reply" notice (matching `POST /api/messages`, which rejects non-approved recipients). Sender names are snapshotted onto each message at send time so history survives deletion (migration `032`).

---

### Group Thread (`/messages/g/[groupId]`)

**Who:** **Approved** members of that group (non-members are redirected to `/messages`; the API returns 403). The thread API checks approved status alongside `group_members` so a lingering membership row from a removed/rejected member never grants access.  
**What:** A shared thread for a group to coordinate. Every group has one (group messaging — full design in [group-messaging.md](group-messaging.md)).

- Sticky header: back arrow, the group's icon (uploaded `icon_image` art / emoji `icon` / `✦`) + name. Flat, chronological message list with sender name + avatar; consecutive messages from the same sender are grouped.
- **Replies (one level, Slack-style):** each top-level message shows **💬 N replies** (or **↳ Reply**) that expands a collapsible reply thread inline with its own composer. Replies never nest further — enforced both in the UI and in `POST /api/messages/g/[groupId]` (a reply's parent must be a top-level message in the same conversation).
- **`@mention`:** typing `@` in the composer opens a member autocomplete (arrow/Enter/Tab/Esc, caret-aware). On send, the server matches `@Name` against current member display names (so mentions typed in replies notify too), creating an in-app notification **and** an email to the mentioned member. In the rendered message, a recognized mention is shown as a colored pill **linked to that member's profile** (`/members/[id]`) — purple for others, gold when it's **you** — so a successful mention is visually confirmed (an `@name` that doesn't match a member stays plain text).
- **Quiet by default:** ordinary posts create **no emails or notification-feed rows** — the unread badge is the only signal. `@mentions` are the deliberate exception (email gated by the recipient's `email_new_message` pref, throttled 30 min per group).
- **Welcome note (migration `071`):** every path that adds a `group_members` row (admin add, `/participate` toggle, open-group join, apply-time `group_select`) drops a **private system note** into the thread — *"Welcome to {Group}! ✦ You're a member of this group — this is its message thread."* Only the new member sees it (`messages.visible_to`; rendered as a centered gold note with "Only visible to you", no bubble/avatar/reply), and it lands **unread**, so the message badge makes them aware of the membership — no email, no notification rows, invisible to everyone else. `sendGroupWelcome` in `lib/conversations.ts` is idempotent per (group, member); removal paths (`deleteGroupWelcome`) clear it so a re-add re-welcomes. The migration backfilled a note for every pre-existing membership.
- Polls every 12s (skipped while the tab is hidden); marks read on view (advances `last_read_at`); auto-scrolls only on new *top-level* messages so reading a thread isn't interrupted.
- **Bell menu** (bell icon at the top-right of the thread header; renders as a slashed/dimmed bell when muted): **Mute** (muted threads don't badge), **Email me about this group** (opt into a throttled activity email for every post), and — for **open** groups — **Leave group**. Backed by `PATCH /api/messages/g/[groupId]/me` and `POST /api/groups/[id]/leave`.

---

### Radio (`/radio`)

**Who:** Approved members
**What:** The community's **curated feed** — the heartbeat of camp. Full spec: [radio.md](radio.md).

Deliberately not chat (no threads, no replies) and deliberately **not an audit log**: every post passes "would the average member care?" and is written editorially — a headline plus an optional momentum line ("Only one more is still needed!"), all copy centralized in `lib/radio.ts`'s post builders. Headlines light the moment's entity gold (`**…**` → `RadioMessage`). Timestamps whisper from the right; content leads. Above the feed, a **kind filter row** (All + one understated text chip per kind, gold underline marks the active one) filters client-side over the already-fetched feed. Day-grouped (Today / Yesterday / date, each rule ending in ✦), newest first, latest 60, signed off with *"That's all for now. Stay tuned."*

**Visual language (her 2026-07-03 mockup):** no cards, **no avatars** — airy hairline rows led by a large raw emoji (or medal art) per automatic kind: `welcome` 👋 · `contribution` ✨ · `achievement` 🏅 · `milestone` 🎉. **Human speech** (`broadcast` + `voice`) reads apart and identically (Chanté 2026-07-08): right-aligned, purple italic, emoji inline, signed "— Name", clock on the left. Above the feed: a hero header (flourished title, script subtitle, art slot for a future radio illustration) and a **stats band** (`getRadioStats`).

**Writing is open to any approved member** (Chanté 2026-07-08, reversing the 2026-07-03 gate): the on-page composer ("Share with camp…" → ON AIR) and the GO LIVE bar post `voice` via `POST /api/radio`; admins keep a separate "official" path (Admin → Radio → `/api/admin/radio`, `broadcast`) but both render the same. Composer extras (both via the `@` autocomplete): **@mention** a member (rings their bell + email), and **@here** — a confirmed 📢 megaphone that alerts every member (bell + email). The `config_radio` **Member voices** toggle is the admin kill-switch. Details: [radio.md](radio.md) → Writing is open.

At the top, the **Now / Up next strip** (`RadioNowStrip`) is derived, never stored: the camp-day welcome ("✦ Day 2 of camp") while today is inside the configured event range, plus what's happening now (purple ● pulse line; open-ended events stay "now" for 90 min) and the next thing starting today — from `schedule_events` (visible + on-schedule, `general`/`mandatory` only; shifts are work slots, not atmosphere). The client picks against the member's own clock (their device is at camp; the server is in UTC) and re-checks each minute.

Radio never notifies for *ordinary* posts (Messages interrupt; Radio informs). The deliberate exceptions: an organizer broadcast posted with **"Also alert members"**, a member post containing **`@here`** (which replaced the earlier "Notify everyone" checkbox — Chanté 2026-07-08; both → `radio_broadcast` bell rows, announcement email, "Tune in →"), and **@mentions** (`radio_mention` bell + message-email to the mentioned member). Notify goes through the shared dispatch seam (`lib/notify.ts`), honouring each member's notification preferences; mentioned members get the personal mention rather than also the broadcast. The home dashboard's `activity` widget ("On the Air") teases the latest 6 posts.

---

## Admin Pages

### Admin Console (four tabs)

**Who:** Users with `publicMetadata.role === 'admin'` in Clerk.
**Tabs** (sticky `AdminNav` on every admin page, incl. nested ones): **Overview** (`/admin/overview`, read-only monitoring) · **Community** (`/admin`, tend the community's shared life — people, communication; renamed from "Members" 2026-07-03. Its Logistics category once held Shared Resources, which became member-owned on `/participate` 2026-07-08 and left the console) · **Program** (`/admin/program`, the schedule and the runway to the event) · **Configure** (`/admin/configure`, standalone definitional structures). Category metadata + anchor ids live in `app/admin/admin-sections.ts`; `AdminNav` renders jump-links to each category and the days-to-camp runway strip.

**Notifications** (`NotificationBell` + `NotificationsSection`): bell icon in the header of every tab shows unread count. Supports mark-as-read per item, mark-all-read, and delete all.

### Community tab (`/admin`)

Sections are collapsible (`CollapsibleSection`) and **default to collapsed** — each header carries an at-a-glance summary (counts), so the page reads as a table of contents. The one exception: **Applications defaults open while pending reviews exist**. The console remembers how you left each section per browser (localStorage), so the defaults only govern a fresh browser.

| Category | Section | Component | What it does |
|---|---|---|---|
| People | Registered Hands | `VolunteersSection` | Members + **active** outside volunteers (people already in) |
| People | Applications | `ApplicationRow` + `PendingVolunteerRow` list | **The one review queue** (2026-07-16): pending member applications and pending volunteer signups in a single date-sorted Pending Review list, each row tagged **Member** (gold) / **Volunteer** (purple); section auto-opens while anything is pending. Approve/decline volunteers inline (expand row); member rows link to the `/admin/[id]` dossier |
| People | Role Requests | `RoleRequestsSection` | Approve/reject member role claims |
| People | Role Suggestions | `RoleSuggestionsSection` | Review member-submitted dept/role suggestions |
| Communication | Announcements | `AnnouncementsManager` | Create/edit/delete member-facing announcements |
| Communication | Radio | `RadioManager` | The curated feed's console (spec: [radio.md](radio.md)): composer (message ≤280 + detail + emoji + optional **"Also alert members"** bell/email), the **Automatic broadcasts** toggles (`config_radio`), and **Recently on the air** — the latest 40 posts with two-tap Remove (curating the feed is communication work, not programming) |
| Logistics | Camp Dues | `DuesManager` | Set how members pay dues + track who has — see [Camp Dues](#camp-dues-dues) |

_(Shared Resources was a Logistics section here until 2026-07-08; it is now member-owned on `/participate` → Bring Something — see [Shared Resources](#shared-resources).)_

(Departments, Groups, Shift Types, Event Dates, Admins, Poll Managers, and Debug live on **Configure**; polls are managed from the home dashboard by admins/poll managers.)

### Program tab (`/admin/program`)

The event's programming, nothing else: two always-open workspaces, each held together by a **soft panel** (cream wash + hairline gold edge) under an enlarged anchored `CategoryHeading` (`large` variant; anchors `#schedule`, `#lead-up` — the targets of Overview's "Needs attention" deep links and the runway milestones).

| Section | Component | What it does |
|---|---|---|
| Schedule | `ScheduleManager` (opens with one controls row: the compact `ShiftSignupToggle` pill (passed as children) left, List ⇄ Week + Add right; the closed-state explanation only appears while signup is closed) | CRUD for schedule events, laid out as a day-grouped program view: one section per day (same day model as the member calendar — `buildScheduleDays`, configured range ∪ event dates, so admin and member views always agree), rows time-sorted with an aligned time column, a day-jump chip rail on top, per-day "+ Add" buttons that prefill the date, an **Undated** bucket for legacy rows missing a date, and the Recurring group below (each row sub-labelled "Every day" or its picked dates). **Every event carries structured Start/End times** (`TimeField`, `app/components/TimeField.tsx` — a house-styled replacement for the native `<input type="time">` used here and in the Lead-Up modal: free-text input accepting "7pm"/"7:30 pm"/"19:00"/"730" over a 15-minute options dropdown, End flavour listing times after the Start with the resulting duration; value contract stays "HH:MM"|null. Start required on all events, end also required on shifts — there is no free-text time field; the display `time` string derives on save, and editing a legacy row prefills Start/End parsed from its old text). A **Show on schedule page** toggle (`show_on_schedule`, migration `058`, default on) keeps an event off the schedule page + home teaser while it stays signable/ackable — unlike Visible, which hides it from members everywhere; rows flagged off wear an "off schedule" chip. **Recurring events pick their days**: the modal's Recurring toggle reveals "Repeats on" day chips (the schedule's day columns); all chips lit = `recurrence_days` NULL = every day incl. later range growth, a subset = an array of ISO dates (migration `057`). A **List ⇄ Week toggle** (remembered in `localStorage` across visits) swaps the day sections for a **week grid** (`ScheduleWeekView`): day columns × hour axis in the member calendar's visual language (same hour scale + shift-type hues from `lib/shift-colors.ts`, mandatory teal), overlapping events share the column side-by-side, recurring events render as ghosted bands in each column they repeat on (`recurrence_days` NULL = every column; ghost bodies are click-through so they never swallow add-at-slot clicks, while the ghost's text label still opens the editor), general events wear a stable per-event hue (`generalHue(id)`, `lib/shift-colors.ts` `GENERAL_HUES`: crimson/chartreuse/silver/citron — bands of the wheel no shift, mandatory-teal, or gold/purple chrome colour owns, so generals never read as another event's kin), shift blocks show `n/cap` + a "✦ no lead" flag — both **per night**: each block/ghost counts only the holds whose `occurrence_date` matches its column's date (NULL for dated one-offs), so a recurring shift's nights read independently, agreeing with the participate picker (fixed 2026-07-10 — it previously showed the event-total on every night); click a block to edit (the edit modal carries a Delete button — from the week grid the modal is the only way to reach an event), click an empty slot to add with that day + nearest half-hour prefilled, and **drag a block to reschedule it** (pointer-based, 15-minute snap: vertical moves the time keeping the duration, crossing columns moves the day; drop PATCHes structured start/end + `event_date` + the derived display `time`, optimistic with snap-back on failure; recurring ghosts and the fix-me strip stay click-to-edit); dated-but-untimed rows surface in a fix-me strip. Both admin views share the member calendar's **late-night convention** (`lib/late-night.ts`): a dated event starting before 6 AM lists/renders at the end of the *previous* night (list rows wear a "late night · into <weekday>" sub-label; week-grid blocks sit past the Midnight line) while `event_date` stays the true morning date — the edit modal explains this under the time fields whenever the start is before 6 AM, and week-grid interactions convert both ways (clicking an empty slot past Midnight prefills the next morning's date; dragging a block below Midnight stores date+1 with the wrapped time). Drag-reorder exists only on recurring rows (the one place `sort_order` affects member display; dated events order by date + time everywhere). Shift rows carry a **compact roster** (`ShiftRoster`, fed by `GET /api/admin/schedule/rosters`): count vs capacity, a "✦ no lead yet" hint on lead-enabled shifts with signups but no lead, and one chip per holder (✦ = lead) — clicking a chip promotes/demotes via the same `set_shift_role` PATCH as the member page; legacy-only holds (no `member_shift_signups` row) are inert. **Signup-destruction guards (2026-07-16):** deleting an event cascades to all its signups (`member_shift_signups` ON DELETE CASCADE), so when the event has any, the delete confirm counts them ("Delete *X* and its 7 signups?", per-night spread for recurring, members-not-notified warning, and a pointer to unchecking a day chip when only one night should go); and **unchecking a "Repeats on" chip now deletes that night's signups on save** — the client confirms with the exact count + nights first, then `PATCH /api/admin/schedule/[id]` deletes signups whose `occurrence_date` falls outside the saved `recurrence_days` subset (returning to "every day"/NULL deletes nothing), and the manager refreshes rosters after. **All-nights-or-just-one prompts (2026-07-16):** deleting a multi-night recurring event first asks *which* via a night chooser (`useChoice` in `ConfirmDialog.tsx` — each night with its signup count, plus "The whole event"); a single night takes the trim-with-cleanup path, the whole event the counted cascade confirm. Saving field edits on one (day chips untouched) asks "All nights, or just one?" — a single night is **split into its own one-off event** with the edits applied (`split_night` in the PATCH: one-off copy inserted, that night's signups *moved* to it with `occurrence_date` → NULL so members keep their spots, night trimmed from the series; carving out the last night deletes the emptied series) |
| Lead-Up Gatherings | `LeadUpGatheringsManager` | CRUD for lead-up gatherings (spec: [`lead-up-gatherings.md`](./lead-up-gatherings.md)) topped by a **month calendar** (`LeadUpCalendar`) — the runway at a glance: click an empty day to add a gathering there (date prefilled), click a gathering chip to edit it; ‹ › month nav opens on the next upcoming gathering's month; the configured event range (Configure → Event Dates) is tinted purple with an "Event" marker; past days dimmed; hidden gatherings at low opacity with ○. The editor requires title + date + start time (the same styled `TimeField` as the event modal, end optional with durations). The row list below keeps Notify / visibility / delete per gathering |

### Configure tab (`/admin/configure`)

The standalone definitional structures, presented as a **collapsed settings menu**: each section is a soft panel (`CollapsibleSection` with the `panel` prop) whose header keeps the title, a plain-English summary, and a live **status chip** (counts computed server-side in `app/admin/configure/page.tsx` — e.g. "3 fields · 9 system", "Jul 22 – Jul 27 · 6 days", "none granted") visible whether open or closed, so the collapsed page doubles as a state-of-the-camp overview. Panels default collapsed; localStorage remembers how you left each one per browser (`glaum-admin-panel:*` keys, separate from the flat variant's `glaum-admin-section:*`). Category headings use the same enlarged `CategoryHeading` as Program. The Application Form entry is a panel-styled link that opens the full-screen builder.

| Category | Sections |
|---|---|
| Forms & Fields | Application Form (link) · Profile Fields |
| Recognition & Tasks | Distinctions · Attunement Tasks |
| Structure | Event Dates · Departments · Groups · Shift Types |
| Access & System | Admins · Poll Managers · Debug Tools |

The Admins / Poll Managers grant lists show the first 5 grantable members with an "…and N more — search" note; searching reveals all matches. (This replaced a fixed-height inner scrollbox that used to trap the page's scroll.)

---

### Application Builder (`/admin/configure`)

**Who:** Admin  
**What:** Full-page form builder for configuring both the Camp Member application and Volunteer signup.

Reached via the **Application Form** link panel at the top of Configure → Forms & Fields.

**The member application is fully modular** — every section and field (built-in or admin-added) can be reordered, edited, resized, hidden, and (non-core) deleted. Config is the source of truth: deletions stick; "Reset to defaults" restores.

**Tab: Camp Member Application**
- Open/closed toggle — hides the form from new applicants when closed
- Collapsible step sections (built-in: Basic Information, Many Hands Registry, What If Plans, Participation & Roles, The Many Hands Agreement, Shrimp) plus any custom sections. Per section: editable title/subtitle, hide, ↑↓ reorder (a custom section can sit **anywhere**, including first), ✕ delete (Basic Information can't be deleted).
- Per field: hide (eye), inline label + description editors, **REQUIRED/OPTIONAL** toggle, **½ / ▭ width** toggle (consecutive halves pair into a two-column row), **drag-to-reorder** via a grip handle on the row's left (gold insertion line marks the drop slot; the row only becomes draggable while the grip is pressed, so inline text editing is unaffected) plus **↑↓ arrows** as the touch/fine-adjust fallback (non-locked fields can move past locked ones; locked core fields have no grip), ✕ delete. A small read-only type tag shows each custom field's type.
- **Required enforcement in the wizard (fixed 2026-07-03):** every visible+required field on the current section blocks CONTINUE until answered — built-in and custom alike, on every section (previously only a hardcoded handful on four sections were checked, and the final section's SUBMIT wasn't gated at all). Agreement fields need every clause checked; a required Group selection is waived when the field offers no groups; the photo block checks the uploaded avatar. Stale localStorage drafts whose saved step exceeds the current section count are clamped instead of crashing the page. A required single/multiple-choice field with "Other" selected also needs its fill-in text non-empty to count as answered (fixed 2026-07-08 — previously "Other" alone satisfied the requirement).
- **Field types:** Short text, Long text, Single choice, Multiple choice (choice fields auto-reveal a fill-in when an option named "Other" is selected), **File upload**, **Agreement** (a checklist of clauses — all required when the field is required), **Group selection** (`group_select`, member form only — a checklist of Groups the applicant can opt into; the admin picks *which* groups the field offers via a checklist in the builder, stored in the field's `options` (unset = all groups); selections add the applicant to those groups on submit). Plus **Divider** and **Text block** layout elements (text blocks render markdown-lite: blank-line paragraphs, `*`/`✦` bullets, `[text](url)`/bare links, `**bold**`).
- **Locked core fields:** First/Last Name, Email, Phone (always present + required, read-only in the builder); Photo is also locked but its Required is toggleable (so admins can allow blank profiles). These are the only NOT-NULL-backed fields.
- "+ Short text / Long text / Single choice / Multiple choice / File upload / Agreement / Group selection / Divider / Text block" buttons at the bottom of every expanded step; "+ Add section" below the step list.
- **Apply-page card editor** — each tab has a title + description editor for the `/apply` TrackPicker card (Camp Member card on the Member tab, Volunteer card on the Volunteer tab), stored in `page_content.config_track_picker`.

**Tab: Volunteer Signup** — open/closed toggle + flat field list with the same per-field controls.

**Saving:** **Manual save** (autosave removed 2026-07-08 by request). Every edit — structural or typed — only updates local state and marks its config key dirty; nothing persists until the admin clicks **Save** (or presses **⌘S/Ctrl+S**). A floating status bar (top-right; bottom-center on mobile ≤640px) shows **Unsaved changes + Discard + Save** (gold, pulsing dot) when dirty, otherwise **Saving… / All changes saved / error + Retry**. Discard restores the last-saved version (confirm-guarded). One Save flushes all dirty keys (`config_member_form`, `config_volunteer_form`, `config_track_picker`) in a single PATCH. A `beforeunload` warning guards reload/close with unsaved edits, and a hint under "Test this application →" notes the preview shows the *saved* form. **Exception:** the applications **open/closed toggles stay live** — they persist immediately (using the last-saved config with just the flag flipped, so they never silently commit unsaved edits).

**Config storage:** JSON in `page_content` under `config_member_form` and `config_volunteer_form`. `mergeMemberConfig` (in `lib/form-config.ts`) reconciles saved config with defaults: it **preserves the saved order of all sections** (built-in + custom), merges built-in field overrides, keeps custom fields as-is, and only re-injects missing *locked* fields (deleted non-core fields stay deleted). Agreement clauses and most option lists now live in the field's `options` in the config (not the legacy `member_acknowledgements` key, which is still read as a fallback).

**Test link:** "Test this application →" opens `/apply?track=member&admin_preview=1` to preview the form live as an admin.

**Key file:** `lib/form-config.ts` — defines `MemberFormConfig`, `VolunteerFormConfig`, all default step/field definitions, and `mergeMemberConfig`/`mergeVolunteerConfig` helpers.

**Mobile layout:** The sidebar collapses to a horizontal scrollable step-indicator strip at the top. Two-column form grids (name pairs, date pairs, etc.) collapse to single column at `< 768px`. `isMobile` is detected via `window.innerWidth < 768` and passed as a prop to each section component.

### Profile Fields (`/admin/configure` → Profile Fields)

**Who:** Admin
**What:** The registry of **member profile detail fields** — the configurable data each member carries (bio, quote, and any admin-added fields like skills or languages). One place defines what a piece of member data means; applications collect it and distinctions evaluate it. Managed inline via `ProfileFieldsManager` (a `Profile Fields` collapsible section on the Configure page), autosaving to `page_content.config_profile_fields` (JSON). Full model in [profile-architecture.md](profile-architecture.md).

- **Per field:** enable/disable, label, `key` (internal identity), description, type (Text / Long text / Number / Yes-No / Single-select / Multi-select / Date, with options for the selects), reorder, delete. Plus capability toggles:
  - **Visible** (the `public` flag) — **on** = shown on the member’s profile (and the editable Profile Details card); **off** = the field is **admin-only**, appearing solely in the member’s application detail (`/admin/[id]` → Profile Details). Never public.
  - **Editable** — members can edit their own value (on `/profile`).
  - **On application** (`applicationEligible`) — the field can be attached to an application question (see below).
  - **For medals** (`distinctionEligible`) — the field can be referenced by distinction rules.
  - **Catch-up** / **Required** — prompt existing members who haven’t filled the field in yet (Phase 4.5).
- **Ties into the Application Builder:** a custom application question can be bound to a profile field (`FieldConfig.profileFieldKey`), so its answer saves to `member_profiles.values` and is reused everywhere. The builder’s field-binding dropdown lists every **On application** profile field (`applicationFields`).
- **Key stability (data safety):** a field’s `key` is the identity its saved answers are stored under, and it is **fully internal — the manager never shows or edits it**. Brand-new (this-session) fields auto-derive a unique key from the label as it’s typed; any field that already existed keeps its key forever, so renaming a label can never disconnect the member answers saved under it.
- **Derived facts** (groups, tenure, designation, …) are shown read-only at the bottom as the “Tracked automatically” strip with plain-English hover hints — computed at eval time, never stored, usable in distinction rules (`system: true` in the registry).

**Key files:** `app/admin/ProfileFieldsManager.tsx`, `lib/profile-fields.ts`

---

---

### Admin Application View (`/admin/[id]`)

**Who:** Admin  
**What:** Full detail view of a single application with approve/reject controls and role/shift management.

Sections:
- **Header** — avatar, name, status pill, submitted date
- **Approve / Reject controls** (`AdminActions`) — visible for pending applications
- **Suspend / Resume attendance** (`SuspendMemberButton`) — visible for approved applications. Suspending (migration `063`) sets `members.suspended_at` and releases **all** the member's commitments — role, groups, shifts, and shared-resource claims (`lib/suspension.ts`) — but keeps their `status` and full site access: a lighter-touch pause than removal, for a member who's unsure they can commit. A **Suspended** pill + the optional suspension note show on the header; resuming lifts the flag (nothing is auto-restored). Suspended members are excluded from Overview participation counts (own box) and attunement nudges.
- **Remove member** (`RemoveMemberButton`) — visible for approved applications. Soft-removes: sets `status = 'cancelled'` with a reason, deletes the member's `camp_signups` + `member_shift_signups` (frees their role + shifts) **and their `group_members` rows** (group membership grants group-thread access and roster presence, so it must not outlive the membership), and notifies them (in-app + email). Reversible by re-approving (groups/role/shifts are not restored — the member re-joins them). Rejecting a pending application likewise revokes any apply-time group opt-ins.
- **Role & Shift** (`MemberSignupCard`) — shown when the member has a `clerk_user_id`:
  - Displays current role (department, role name, commitment level, approval status) and **every shift the member holds** (title, time, day — `member_shift_signups` ∪ legacy single, deduped)
  - **"Approve role"** button — appears when `role_approval_status === 'pending'`; calls `PATCH /api/admin/role-requests/[clerkUserId]`
  - **"Remove role"** button — clears `role_id` + `role_approval_status` from `camp_signups` via `PATCH /api/admin/signups/[clerkUserId]` with `{ clear_role: true }`
  - Per-shift **"Remove"** button — `{ remove_shift: <eventId> }` deletes that `member_shift_signups` row (and clears the legacy column if it pointed there); `{ clear_shift: true }` clears all
  - Confirmation dialog shown before any removal; UI updates optimistically after success
- **Full application fields** — all submitted built-in answers grouped by section
- **Additional Responses** — answers to admin-added custom fields, with labels resolved from the form config (orphaned/deleted-field answers shown by key). File-upload answers render as download links; "Other" fill-ins shown as an "Other: …" line. Answers to the built-in Many Hands Agreement still show in their own Acknowledgements section.
- **Profile Details** — the member's canonical profile-field values (`member_profiles.values`), rendered from the Profile Field registry. **This is the admin-only surface for fields marked _not_ Visible** (`public: false`) — those never appear on the member-facing profile and are tagged "· admin-only" here. Only shown when the member has values.

**Key files:** `app/admin/[id]/page.tsx`, `app/admin/MemberSignupCard.tsx`, `app/admin/RemoveMemberButton.tsx`  
**API:** `PATCH /api/admin/signups/[userId]` — accepts `{ clear_role: true }`, `{ remove_shift: <eventId> }` (one shift), or `{ clear_shift: true }` (all shifts; both the many-to-many table and the legacy column)

---

### Admin Overview (`/admin/overview`)

**Who:** Admin  
**What:** Summary stats + `MembersDropdown` for quick navigation. Every member name on this page (the dropdown, group/rideshare pills) links to their `/admin/[id]` dossier (2026-07-08).

Sections:
- **Needs attention** (first card) — up to five prioritized actionable lines (pending applications / volunteers / role requests / role suggestions / un-notified upcoming gathering / full-but-leadless shifts), each a verb deep-link into the console; empty state names the days to camp. Data: `lib/admin-attention.ts` (`getAttentionItems`). Counts that imply work elsewhere on the page are verb links too ("Review N pending →", "Assign in Groups →").
- **Participation** — approved member count, signup completion, active volunteer count, members list (expandable)
- **Shift Hours** — the organizer's supply-vs-demand ledger, from real schedule + requirement data (`lib/shift-hours-overview.ts` `getShiftHoursOverview`): totals (hours **promised** / hours **to fill** / hours filled / empty-shift count) + a per-shift-type breakdown card coloured to match the schedule's shift palette (`shiftHue`), headlined by that type's promised hours. **Promised (supply)** = what approved members collectively owe by requirement: universal typed `shift` attunement tasks (everyone) merged with group/role `required_shift_type_id`/`required_shift_hours` (max per type per member — attunement's own rule); a type with promised hours but nothing scheduled still shows. **To fill (demand)** = spot-hours the schedule opens: occurrences × duration × capacity, counted **only for shifts with a set capacity** (an uncapped shift has no defined demand — reported as "N shifts · no set spots", never hours). Filled = each held occurrence (`member_shift_signups.occurrence_date` ∪ legacy single, deduped) × its shift's duration (`shiftDurationHours`). **Each night of a recurring shift is a regular shift** (`lib/shift-occurrences.ts`: `recurrence_days`, or every day of the configured event range). Coverage is **exact** — a signup names its night, so filled hours and empty-shift counts are counted directly per occurrence (no estimation). Deliberately **no duration-only "scheduled hours" total** (a 3h shift with 5 spots is 15h of work — bare durations read as neither supply nor demand) and **no completion %/bars** (counts, not unit-% — the shared-resources lesson). Events whose shift type was deleted bucket as "Untyped". Replaced the flat 3h-per-member estimate (2026-07-03)
- **Groups** — one card per row in the `groups` table (sort order honoured) with member pills, via `getGroupNamesByUser`; "In no group" card for unassigned members
- **Rideshare** — breakdown by rideshare intent
- **Poll Results** — all polls with bar chart per option (vote count + percentage). Leading option highlighted in gold. Shows Hidden/Closed badges. Hidden if no polls exist.

All admin surfaces also carry the **runway strip** inside the sticky `AdminNav`: "✦ N days to camp" plus the next dated milestones (upcoming gatherings, camp start) as jump links — `lib/admin-attention.ts` (`getAdminRunway`). The member detail page (`/admin/[id]`) shows **cross-reference chips** under the header: department·role, each group, and "N shifts held" (anchors to Role & Shift).

---

## Kitchen Board (catering) — moved to All Hands

The catering kitchen board (formerly `camp.glaum.ca/kitchen.html` + the
unauthenticated `/api/kitchen-list` and `/api/kitchen-ai` routes) was extracted
2026-08-26 into its own product repo, **All Hands** (`~/Projects/all-hands`),
and its state copied to the All Hands deployment. Nothing remains in this app —
page and routes were deleted outright and the old URL 404s; by Chanté's call
the camp app carries no link to the new deployment. Spec and history:
`all-hands/docs/kitchen-board.md`.

## Supporting Features

### Shoutouts

Member-posted shoutouts shown on the home-page member dashboard (the `shoutouts` widget). A lightweight, member-driven complement to admin Announcements.

**Member experience:**
- The widget shows the shoutout feed (newest first): author avatar, name, time-ago, and body.
- Approved members post via a **"✦ Share a shoutout"** button pinned at the bottom; it opens an inline composer (avatar + textarea, 250-char limit with counter, Cancel / Post). On success the composer collapses and the new shoutout appears at the top.
- A member can **delete their own** shoutout via the ✕ on it; **admins can delete any**.
- Author avatars are joined in JS from `applications` at render time (no FK), so they stay current.

**Data + auth:**
- Table `shoutouts` (migration `031`): `clerk_user_id`, `author_name` (display-name snapshot), `body` (1–250 chars, DB CHECK), `visible` (reserved for moderation), `created_at`.
- Posting requires an **approved** member (same check as role suggestions). Delete is allowed for the **author or an admin**.

**API routes:**
- `GET /api/shoutouts` — list visible shoutouts (authenticated)
- `POST /api/shoutouts` — post a shoutout (approved members)
- `DELETE /api/shoutouts/[id]` — delete a shoutout (author or admin)

**Key files:** `app/ShoutoutWidget.tsx`, `app/api/shoutouts/route.ts`, `app/api/shoutouts/[id]/route.ts`, wired into `app/page.tsx` (widget map) and `app/HomePageEditor.tsx` (layout label).

---

### Polls

Admin creates polls in the Admin Dashboard → Polls section (or via `+ Poll` in the page editor).

**Member experience:**
- Active (visible + non-expired) polls appear in the `polls` dashboard widget
- Results (progress bars, percentages, vote counts) are visible to **all** members, voted or not — voting just adds the ✓ highlight on your choice
- Members can change their vote at any time (previous votes are replaced)
- Single-choice and multiple-choice modes supported

**Admin experience:**
- Create/edit via `PollsManager` (Admin Dashboard) or the `+ Poll` button in page edit mode
- Visibility toggle per poll (hidden polls still store votes, just aren't shown to members)
- Optional expiry date — expired polls show a "closed" badge and accept no new votes
- Results visible in Admin Overview → Poll Results section with bar charts

**API routes:**
- `GET /api/admin/polls` — list all polls (admin only)
- `POST /api/admin/polls` — create poll (admin only)
- `PATCH /api/admin/polls/[id]` — edit poll (admin only)
- `DELETE /api/admin/polls/[id]` — delete poll + all votes (admin only)
- `POST /api/polls/[id]/vote` — submit or update a member's vote (authenticated members)

**Key files:** `app/PollWidget.tsx`, `app/admin/PollsManager.tsx`, `app/api/admin/polls/`, `app/api/polls/`

---

### Role Badge

Generated at `/api/badge?role=...&dept=...` as a PNG. Displayed on profile and member pages. See [architecture.md](architecture.md) for generation details.

### Shifts (multi-signup, hours requirements)

Rebuilt 2026-07-01 — full design + history in [shifts-redesign.md](shifts-redesign.md).

- **Model:** every schedule event has a `participation_type` (`general` / `shift` / `mandatory`). Shift events belong to a configurable **shift type** (`shift_types` registry — Setup, Teardown, Decor, Service, …; requirement-free kinds) and carry real `start_time`/`end_time` (duration = hours). Requirements are authored on whoever owes them: a **group/role** (`required_shift_type_id` + `required_shift_hours`, set in the group/role edit modals) or an **attunement task** (universal, e.g. "everyone owes 3h Service"). A shift type nothing requires is simply optional (e.g. a Tea shift).
- **Who can hold a shift:** an **approved member or an active volunteer** (2026-07-16) — the APIs gate on `getShiftParticipant` (`lib/members.ts`), and `memberDisplayNames` (`lib/member-names.ts`) resolves roster/lead names from `members` ∪ `volunteers` (member row wins on a dual identity), so volunteers appear on rosters, cards, and confirm modals like anyone else. Volunteers see no owed-hours chips (hour requirements are member attunement); their picker lives on the shifts-only `/participate` variant. Reminder + confirmation emails resolve volunteers too (`lib/event-reminders.ts`; the volunteer's links point at `/participate` since `/schedule` is member-gated).
- **Per-night occurrences (migration `064`):** recurrence is only an admin authoring convenience — **each night of a recurring shift is a regular shift in its own right**, signed independently with its own capacity, roster, hours and lead. A signup names its night via `member_shift_signups.occurrence_date` (NULL = a non-recurring shift's single occurrence). The concrete nights come from `lib/shift-occurrences.ts` (`recurrence_days`, else every day of the configured event range) — the single source reused by the picker, API validation, the ledger, and the attention digest.
- **Member picker** (`/participate`, `SignupSection.tsx` `ShiftsPicker`): its own **"Shifts" page section**, headed like Bring Something / Your Groups (gold divider + `TokyoDreams` h2 + a dynamic one-liner covering the requirements state, or the "signup not open yet" notice with the panel hidden); inside the purple-accented panel, a calendar of day columns derived from the shifts' real dates; **a recurring shift shows one card per night**, each in its own day column with its own spots/held state (composite slot id `eventId::date`); within a day column, cards are ordered **chronologically by start time** (`getShiftSignupData` sorts the flattened slots by `event_date` then 24h `start_time` — without it, expanding recurring events interleaved them by source event and floated a late-night shift above an earlier-afternoon one, 2026-07-06 fix). Cards coloured by shift type; owed-hours chips (`Teardown 0/3h`) above; one tap opens a styled confirm modal (`ShiftConfirmModal`, which names the night) to sign up / cancel. Members hold **any number** of occurrences (`member_shift_signups`); **per-night** capacity + `config_shift_signup_open` enforced server-side. Held nights are listed (cancellable) in the "Your Shifts" card and appear on the personal schedule + Commitments card. **Who's signed up is visible to members** (added 2026-07-06): each card carries a compact **roster cluster** — initial discs (leads gold-ringed) with a "+N" overflow and the full names on hover — and the confirm modal lists every holder under "Signed up (N)", leads marked ✦, the current member marked "you". The names come free from `fetchAllHolds` in `lib/participate-data.ts` (which already collected holder ids for the count/leads); `getShiftSignupData` now resolves them all via `memberDisplayNames` and attaches a per-slot `roster: { name, isLead, isSelf }[]` (leads first, then alphabetical). No new disclosure boundary — members already see each other on `/members` and lead names already showed on these cards.
- **API:** `GET/POST/DELETE /api/shift-signups` — per-occurrence slots with per-night counts (from `member_shift_signups`, the single source of shift holds), the member's owed requirements (derived group/role merged with universal tasks, max hours per type), sign-up (`occurrence_date` validated against the shift's real nights; admin notified), cancel (`occurrence_date` query param).
- **Leads (shifts only — migrations `048`+`049`, gathering half scrapped by `050`):** whether a shift **has** a lead role is the organizer's call — a "This shift has a lead ✦" checkbox in the schedule editor (`schedule_events.needs_lead`, default off; some shifts don't need one). On lead-enabled shifts the offer comes **at signup time**: the confirm dialog shows an "I'd like to be the shift lead ✦" checkbox (only while the lead seat is empty); picker cards show "✦ needs a lead" until someone takes it, then "✦ Led by …". Held shifts keep a secondary offer/step-back link (gated on `needs_lead`; same `POST /api/shift-signups` with `role: 'member' | 'lead'`, server-rejected on non-lead events). The role lives on the `member_shift_signups` row — it disappears with the signup, co-leads are just multiple lead rows, and it's **display-only** (no permissions attach). Admins promote/demote from the member's shifts card on `/admin/[id]` **or from the shift's roster in the schedule editor** (both via `set_shift_role` on `PATCH /api/admin/signups/[userId]`). A shift that fills up with nobody holding the lead can no longer resolve itself at signup time, so the Overview **Needs attention** digest flags it ("… is fully signed up but has no lead ✦" → Program) — the organizer picks someone from the shift's roster and promotes them right there; there is deliberately **no automated nag** to holders. **Lead-up gatherings have no lead role** (built 2026-07-02, scrapped same day — migration `050`); gatherings keep the free-text `host` and binary RSVP. General `event_rsvps` also excluded.
- **Attunement:** reflects it all — see the `shift` requirement + derived lines under Attunement Status.
- **Admin:** shift types in Configure → Structure → **Shift Types**; slots created in the schedule editor (participation → shift type → start/end + capacity); **per-shift roster in the schedule editor** (who's signed up, count vs capacity, promote/demote leads — `GET /api/admin/schedule/rosters`), which **breaks out one roster line per night** for a recurring shift (each labelled by date, with its own count/capacity/lead — `set_shift_role` carries `occurrence_date`); each chip carries a small ↗ that opens the holder's `/admin/[id]` dossier (2026-07-08; the chip itself stays the lead-toggle button, since it's already interactive); per-member shifts on `/admin/[id]`; "has shift" indicator on the roster (boolean, not hours-satisfaction — future polish).
- **Colours:** `lib/shift-colors.ts` — mandatory = teal; each shift type gets a palette hue by registry position (shared by both calendars + the picker; per-type configurable colour is a future hook).
- **Legacy cleanup (done 2026-07-08, migration `065`):** the legacy columns (`event_type`, `contribution_type`, `all_hands`, `event_category`, `camp_signups.schedule_event_id`/`shift_id`), the dormant `event_types` table, the dead `shifts` table + `/api/admin/shifts` routes, and the `lib/event-type-compat.ts` shim are all dropped; `member_shift_signups` is the single source of shift holds.

### Role Selection & Approval Flow

Members pick a role via `SignupSection` on `/participate` (Participate) — a **flat registry picker** under its own **"Choose a Role" page section** (gold divider + `TokyoDreams` h2 + the registry one-liner, same construction as Shifts / Bring Something) that **starts collapsed once a role is held** (the expanded registry ran long and buried the rest of /participate). Collapsed, the panel is a sealed door, not a hidden one: **every department's emblem in a brass ring** (tiny uppercase name beneath — the same rings as the plaques) over a solid gold **"Browse all N roles ▾" pill button**; the whole panel toggles it, and expanded a small centered "Fold the registry away ▴" link closes it. A member with no role lands with it open, confirming a claim folds it back down, and opting out re-opens it. Expanded: every role visible at once under **`TokyoDreams` department headers** (icon + name + `─ ✦` hairline, description beneath, generous gap between groups), as compact cards in a responsive grid (name, status, 2-line description clamp, colour-scaled commitment pill, 🔒 when approval-gated). Above the picker, the **Your Role / Your Shifts standing cards** are drawn as engraved **plaques** — a double rule (border + inset `outline`) with a centered `✦ Your Role ✦` kicker between hairlines, brass-ringed department emblem, `TokyoDreams` role name, on a **solid panel** (`#231132` + drop shadow) so mass, not brightness, separates them from the translucent single-hairline cards below. Frame strength is **constant regardless of filled/empty state** — no glow, no conditional emphasis (Chanté, twice: the member's role is already highlighted in the full list; don't re-highlight it here). Tapping a card opens the **role detail modal** (`RoleDetailModal`) with the full charge (purpose, before/during, ideal-for), a "View in the Registry →" deep link, and the confirm button (`Confirm` / `Switch to this role` / `Request Role`). Roles can also be claimed directly on `/roles` (see Registry of Roles). Either path submits to `POST /api/signup`.

**Approval logic in `POST /api/signup`:**
- If the role changed (`isRoleChange = true`) and `roles.requires_approval = true` → `role_approval_status` is set to `'pending'` and an admin notification is created
- If the role changed and `requires_approval = false` → `role_approval_status` is set to `null` (immediately confirmed)
- If the role did **not** change → the existing `role_approval_status` is **preserved unchanged**. (Shift signups no longer flow through this endpoint — they use `/api/shift-signups` — so the historic wipe-on-shift-update hazard is gone; the guard remains for safety.)

**`role_approval_status` values:**
| Value | Meaning |
|---|---|
| `null` | No approval needed (role doesn't require it), or role was cleared |
| `'pending'` | Waiting for admin review |
| `'approved'` | Admin approved the role request |

**Admin approval:** via `PATCH /api/admin/role-requests/[clerkUserId]` with `{ decision: 'approved' | 'rejected' }`. Approval sets `role_approval_status = 'approved'`. Rejection sets `role_id = null` and clears the status. Both send a `user_notifications` row to the member.

The dedicated **Participate** page (`/participate`) hosts `SignupSection` (the standing plaques, then the **Choose a Role** and **Shifts** sections — headers rendered inside the component since the data lives there), then the member-owned **Bring Something** shared resources (`ResourceCommitments` — create lists, add items, claim; see [Shared Resources](#shared-resources); anchored `#bring` for the home-banner deep link, placed above groups because needs are live and time-sensitive while group membership is a set-once choice), then the **Your Groups** group opt-in (`GroupCommitments` — see [Groups](#groups)). The Commitments card's "Manage commitments →" link points here. **Active volunteers** get a shifts-only variant of the page ("Lend a Hand" h1, `SignupSection` with `hideRole` + empty departments + `owed: []` — just the shifts plaque and the calendar picker; see Volunteer above).

**Key file:** `app/api/signup/route.ts`

### Role Suggestion Flow

1. Member opens `SuggestRoleModal` from the Signup Section
2. Fills in department name + role name + optional notes
3. `POST /api/role-suggestions` → creates row in `role_suggestions` + admin notification
4. Admin sees it in "Role Suggestions" section
5. Approve → finds/creates dept (case-insensitive), creates role, notifies member via `user_notifications`
6. Reject → notifies member via `user_notifications`

### Groups

Configurable groups members belong to (e.g. Setup, Teardown, Decor). **Replaced** the old contribution-types/`setup_preference` mechanism (migration `030`; see [database.md](database.md) for the `groups` + `group_members` tables).

Every group also has a **message thread** for coordination — see [Group Thread](#group-thread-messagesggroupid) above and [group-messaging.md](group-messaging.md). Governance (`join_policy`, `visibility`) and member self-join/leave shipped in Phase 6; **leads** (`group_members.role`) and the `request` join policy are still to come.

**Admin — `Admin → Groups` (`GroupsManager.tsx`):**
- Create / edit / delete / reorder groups (name, description, icon). Deleting a group or collection asks via the styled in-app `ConfirmDialog` (names the item; see design-system.md → Confirm Dialog) instead of the native browser confirm; a non-empty collection gets a notice ("… isn't empty yet", with the group count) up front rather than a server error.
- **Who can join** — `admin_assigned` (admins manage membership; the default, for crews) or `open` (members self-join/leave). **Visibility** — `listed` (open groups appear in the member Find-a-group picker) or `hidden`. Open groups show an `OPEN` pill in the list.
- Expand a group to see its **roster** and **assign members** (searchable picker of approved members) or remove them. Each membership records a `source` (`admin`, `application`, or `self` for self-join). Roster names link to that member's `/admin/[id]` dossier (added 2026-07-08, part of the admin-console roster-links sweep — A5's second half).
- **Icon** (optional): the group modal uses the shared **`AssetImagePicker`** (see [Asset library & image picker](#asset-library--image-picker)) — pick a built-in image, reuse another group's icon, or **Upload your own** (`POST /api/admin/groups/[id]/icon` → normalized by `lib/icon-image.ts`, stored in the public `group-badges` bucket). The image is written to `groups.icon_image` via the normal form save (create *or* edit), so a **brand-new group can set its icon before it's saved** (uploads use a generated storage key). Separate from the optional **emoji** field, `groups.icon`.
- API: `/api/admin/groups` (GET/POST), `/api/admin/groups/[id]` (PATCH/DELETE), `/api/admin/groups/[id]/members` (GET roster / POST add / DELETE remove), `/api/admin/groups/[id]/icon` (POST/DELETE icon image).

**Applicant opt-in (optional):** admins can add a **Group selection** field (`group_select`) to the member application in the Application Builder. The field carries its own list of offered groups in `FieldConfig.options` (group ids; **unset = all groups**, chosen via a checklist in the builder). On submit, picks become `group_members` rows (`source = 'application'`); `/api/apply` re-validates choices against the visible `group_select` fields' configured ids. This governs the **apply form only** — it is a separate gate from the Participate self-service below (which uses the collection's `self_join` flag).

**Member self-service:** approved members can join/leave **opt-in groups** anytime via the **Your Groups** section on `/participate` (`GroupCommitments.tsx` → `GET/POST /api/groups/membership`). A group is offered here when its **collection has Self-join on** (`group_collections.self_join`, migration `044`; a group with no collection is not self-joinable). Self-join is a single **collection-level** toggle in the collection editor, fully **independent** of the collection's **Visible on profile** toggle (`show_on_profile`, profile display only). It's also a **different** gate from the application wizard's `group_select` field (apply form only), and group **`visibility`** (`listed`/`hidden`) does **not** affect this list (that governs the Find-a-group picker only). The offered groups are **grouped under their collection name** (uppercase gold header per collection, ordered by collection `sort_order`, groups by their own `sort_order` within). Toggling calls `router.refresh()` so the Commitments card + stat counts update. If nothing qualifies, the section shows "No opt-in groups are available right now." *(The old per-group "Members can opt in" flag `groups.apply_selectable` is dormant since `044`.)*

**Group visuals on the profile:** each group's icon appears as the circle icon of its **Active Commitments** row — the emoji `icon` if set, else the uploaded `icon_image` (rendered as a circle-filling `<img>`, scaled to crop the wide icon-frame margins), else `✦` (`groupCommitmentMeta` in `lib/groups.ts`). A group's `icon_image` can also be reused as **distinction medal art** (picked in the Distinctions admin builder). The old scattered-badge cluster (`ContributionBadges.tsx`) was removed in the profile refactor.

**Where group membership is read:** member Commitments card, `collection` attunement tasks (membership counts per collection), **derived shift requirements** (a group's `required_shift_type_id`/`required_shift_hours` obligate its members — `lib/shift-attunement.ts`), the members directory, and Admin Overview/Registry — all via `lib/groups.ts` (`getMemberGroups`, `getGroupNamesByUser`). *(The old Personal Schedule `contribution_type` name-matching is retired — the personal schedule now shows the shifts a member actually holds.)*

**Key files:** `app/admin/GroupsManager.tsx`, `app/profile/GroupCommitments.tsx`, `app/profile/CommitmentsSection.tsx`, `app/api/admin/groups/`, `app/api/groups/membership/route.ts`, `lib/groups.ts`, `lib/icon-image.ts`.

### Shared Resources

Coordinates the physical gear members bring to the event (stoves, coolers, tools). **Member-owned since 2026-07-08** — the admin authoring console was removed and the whole thing lives on `/participate`: any approved member creates lists, adds items (with optional "needed" targets), and meets needs with one-click **claims**. Full spec + non-goals: [shared-resources.md](shared-resources.md); tables (`resource_lists`/`resources`/`resource_claims`, migration `051`) in [database.md](database.md).

- **Permissions (wiki-open, one guardrail):** any approved, non-suspended member may **create** a list, **rename/edit** any list, and **add/edit/delete** items on any list. **Deleting a whole list is admin-only** (it cascades away every item + claim). Enforced server-side (member routes gate on `getApprovedMember` + `suspended_at`; list DELETE on `requireAdmin`) and reflected in the UI via `canManage`/`canDeleteLists` props set from the `/participate` server page. No schema change was needed (no owner column — editing isn't per-user gated).
- **Member — `/participate` → "Bring Something" (`ResourceCommitments.tsx`, anchored `#bring`, above Your Groups):** a **coordination workspace** (each list = **one** gold-bordered **collapsible** card, **collapsed by default** 2026-07-08 — the board is a scannable index of every list, header row = title + health pill + one-line summary; empty lists show as clearly as full ones; opening shows items + add footer + Edit/Delete; creating/adding auto-opens that list): a top **toolbar** (`＋ New list` + `＋ Contribute something`), a **pulse line** ("✦ 3 members contributed resources today" / "✨ Sarah just covered the last Cooler!", from claim timestamps), a pinned **I'M BRINGING** card (my commitments, per-row *Edit ›* expands + scrolls to the item), per-list **automatic health** (pill: **Needs Attention** / **Almost Ready** / **Complete** + "18 of 22 resources covered · 4 still need attention" — item counts, not unit percentages), **dense task-list rows** (hairline-divided in one container per group: **Still Needed** → **Covered** → **Member Contributions**; meta line carries shortage + first two claimant names inline) and **expandable rows** (note + **who's bringing it** — ✓ names, member-visible social proof — + my −/+/Remove claim controls + inline **Edit item / Remove item** for anyone approved). Empty state invites authoring ("No resource lists yet. Start one…"). Quantities: three coolers = one claim ×3; stepping to 0 unclaims; over-fulfillment allowed. Mutations call `load()` + `router.refresh()` so the board + profile card stay truthful.
- **Authoring (member-owned, 2026-07-08):** lists via `POST /api/resources/lists` (title + description + `show_on_dashboard` opt-in, live immediately); edit/delete via `PATCH/DELETE /api/resources/lists/[id]` (DELETE admin-only). Items via `POST /api/resources/items` `{ list_id, name, note, quantity_needed?, bring? }` — an optional **"How many needed?"** field makes it a tracked need (blank = an open offer, `quantity_needed NULL`); `offered_by` = the member; the **"I'm bringing this myself"** checkbox (default on) seeds the ×1 claim + fires the `contribution` radio moment. Edit/delete items via `PATCH/DELETE /api/resources/items/[id]`. Contribution rows show *"Added by Sam"* (lavender, italic) and group under **Member Contributions**; others pile on with normal claims. Stepping your own contribution's last claim to 0 **retracts the listing** (unless others have claimed — then it's communal and stays). The `/api/resources/items` route **absorbed** the former `/api/resources/offers`. Two front doors to the same add form: the top-level **＋ Contribute something** (with a list picker — add to any list without hunting for the card) and each card's **＋ Add something to this list** footer.
- **Home dashboard:** the **Bring Something widget** (id `resources`, admin-reorderable like any widget) shows a **compact row per dashboard-opted-in list** (`show_on_dashboard`) — readiness status per list, overall % header, a personal commitments line — see Homepage → Member dashboard. Opt-in (default off) via each list's editor.
- **Profile:** each claim renders as a `BRINGING` row on the **Active Commitments** card ("Camping Stove ×2 · Shared Kitchen", with the item's icon when set, via `lib/resources.ts` → `getMemberResourceClaims`) and counts toward the header's Active Commitments stat.
- A claim **is** the confirmation (no pledge→confirm workflow); totals are always derived from claim rows, never stored.

**Key files:** `app/profile/ResourceCommitments.tsx` (the member-owned surface), `app/api/resources/` (`lists`, `lists/[id]`, `items`, `items/[id]`, `claims`), `lib/resources.ts`. (No admin surface — removed 2026-07-08.)

### Camp Dues (`/dues`)

Camp dues — the shared money members chip in. **This year dues are collected by email / e-transfer** (payment happens outside the app). Because there's no automatic reconciliation, dues move through three states: **owed → awaiting review** (the member self-reports paying) **→ paid** (an admin confirms). A Stripe integration is a deliberate **future TODO** — the schema is already shaped for it (a webhook would set the same `members.dues_paid_at`). State columns: `members.dues_paid_at` / `dues_paid_by` / `dues_note` (migration `067`) + `dues_reported_at` (migration `068`), and `volunteers.dues_paid_at` / … (migration `069`); settings + payment info: `page_content.config_dues` (`lib/dues.ts`, `parseDuesConfig`).

- **Settings (in the Camp Dues admin section):** an **on/off toggle** (`config_dues.enabled`, **default off** — dues start off and must be turned on by hand per community; when off, `/dues` shows nothing, self-report is rejected, any dues attunement task is dropped, and the tracker is hidden) and a **"Who owes dues"** audience (`config_dues.audience`, default **camp members only**). **Camp members** get the full flow (self-report + attunement + tracker); **volunteers** are **admin-tracked only** (they have no self-serve `/dues` or attunement — the separate `volunteers` table), so they appear in the tracker for mark-paid but can't self-report. Toggling either saves immediately and refreshes the roster.

- **Member self-report (`/api/dues/report`, `DuesReportButton.tsx`):** on `/dues`, an unpaid member taps **"I've sent my dues"** → sets `dues_reported_at` and notifies admins (`dues_reported`; the notification links straight to the member's `#dues` section on `/admin/[id]` with a **"Confirm payment →"** CTA). The page then shows **"we're confirming your payment"** with an **Undo** (retract a mistaken claim — allowed until an admin confirms). Self-report **satisfies the member's attunement checklist** (shown "· awaiting confirmation") so a member who's paid isn't nudged while unreconciled.
- **Admin — `Admin → Community → Logistics → Camp Dues` (`DuesManager.tsx`):** two parts. **(1) How members pay** — payment email, **fixed amount *or* sliding scale** (a pay-what-you-can min–max range), and a markdown-lite instructions blurb; saved to `config_dues` (debounced PATCH to `/api/admin/page-content`). Amounts are free text — no currency assumption. **(2) Who has paid** — a roster of everyone in the audience (camp members, and volunteers when that audience is on — volunteer rows wear a "Volunteer" tag) with a running "N paid · M to review · K owed" count and an **All / To review / Owed / Paid** filter (self-reported rows sort to the top — they need your action). Each row has a **Paid on/off toggle** (flip on to mark/confirm paid, off to undo → owed) plus, while unpaid, a **note field** ("$50 e-transfer") applied when you flip it on; an awaiting row also shows **Not received** to dismiss the self-report without confirming. Suspended members are shown de-emphasized and left out of the counts. All mutations POST `/api/admin/dues/[memberId]` (keyed by row id + `entity: 'member'|'volunteer'`; `paid:false` also clears a member's self-report).
- **Admin — member detail (`/admin/[id]`):** a **Camp Dues** section (`DuesMemberControl.tsx`) mirrors the tracker for a single member — surfaces an "awaiting review" note when they've self-reported, with Confirm / Not received, else Mark paid (+ note) / Mark unpaid.
- **Member — `/dues`:** shows the member's own status (Paid ✓ + date · awaiting confirmation · or owed), the self-report control while unpaid, and, while owed, the configured **how to pay** (amount / sliding-scale range, payment email as a `mailto:`, instructions). Reached from the attunement checklist's **Camp dues paid** item.
- **Attunement:** add a **Camp dues paid** task in Configure → Attunement Tasks (`dues` requirement) to make dues part of the checklist — it completes when the member self-reports **or** an admin confirms, and (like any required task) feeds the nudge emails. If an admin hits **Not received**, the item re-opens and nudges resume. Opt-in: not in the default task list.

**Key files:** `lib/dues.ts` (pure config + `duesAppliesToMembers`/`duesAppliesToVolunteers`), `lib/dues-roster.ts` (audience-aware server roster loader), `app/dues/page.tsx` + `app/dues/DuesReportButton.tsx`, `app/admin/DuesManager.tsx`, `app/admin/DuesMemberControl.tsx`, `app/api/admin/dues/[memberId]/route.ts`, `app/api/dues/report/route.ts`.

### Distinctions

Earned, ceremonial honours shown as engraved medals in the profile's **Cabinet of Distinctions**. The architectural rule is **store facts, not badges** — distinctions are *derived* on every render from member facts + admin rules, never persisted.

- **Facts** (`lib/member-facts.ts`) — `buildMemberFacts({ application, roleInfo, memberGroups, roleApproved, profileValues })` returns a typed `MemberFacts` object. This pass is **derive-only**: only facts sourceable today are computed — `joined_year`/`years_since_joined` (**earliest evidence of membership**: the member-reported `gatheringsAttended` years from `member_profiles.values` ∪ the `applications.submitted_at` year, whichever is earliest — application year alone would date everyone to the site's launch year; hardcoded field key logged in the generalizability log), `designation`/`department` (role join), `group_count`/`groups`, `camped_before`, `has_photo`, `is_approved`. `joined_year` backs the "Member since" stat on `/profile` **and** `/members/[id]`. `MEMBER_FACT_CATALOG` describes each fact (key, label, type) so the admin builder can render the right operator/value inputs.
- **Rules** (`lib/distinctions.ts`) — admin-configurable, stored as one JSON string in `page_content.config_distinctions` (mirrors the Attunement Tasks pattern). `parseDistinctions` parses/validates (falling back to `DEFAULT_DISTINCTIONS`); `evaluateDistinctions(facts, rules)` returns the earned medals (enabled rules whose conditions **all** pass). A `DistinctionRule` has a label, optional description (hover tooltip), medal `image` (+ `glyph` emoji fallback), an optional short static **`engraving`** caption (≤`DISTINCTION_ENGRAVING_MAX` = 32 chars, shown under the medal), an optional dynamic `yearFact`, and AND'd `conditions` (`{ fact, op, value }`, ops in `DISTINCTION_OPS`). A condition on an absent/null fact never passes, so rules referencing not-yet-derivable facts (e.g. `camps_attended` for "Glåüm Elder") stay dormant until that fact exists.
- **Admin** — `Admin → Distinctions` (`DistinctionsManager.tsx`, cloned from `AttunementTasksManager`, rendered in `app/admin/configure/page.tsx`): add/edit/reorder/enable rules with debounced autosave to `config_distinctions`. Medal art is chosen via the shared **`AssetImagePicker`** (Distinctions tab first) — a built-in library image, a reused group icon, or an upload; the old emoji-glyph and pasted-URL inputs were removed (glyph remains a render-time fallback only). Each rule also has the optional **engraving** caption field and the year source; conditions use the fact catalog.
- **Defaults** — Founding Member (`joined_year ≤ 2026`), Five Year Attunement (`years_since_joined ≥ 5`), Many Hands (`group_count ≥ 3`), and a dormant Glåüm Elder. So the cabinet populates out of the box.

**Out of scope (deferred):** a member-facts DB migration for facts that aren't derivable yet (`camps_attended`, `years_attended`, `shift_count`, `founder_status`, …). Rules referencing them are defined but stay dormant.

**Key files:** `lib/member-facts.ts`, `lib/distinctions.ts`, `app/profile/CabinetOfDistinctions.tsx`, `app/admin/DistinctionsManager.tsx`, wired in `app/profile/page.tsx` + `app/admin/page.tsx` (`config_distinctions`).

### Asset library & image picker

A shared, growable library of reusable images/icons with one picker component used across the admin. Any admin feature that has an image/icon field uses it: **Distinctions** (badge art), **Departments** (department icon), and **Groups** (group icon).

- **Picker** (`app/admin/AssetImagePicker.tsx`) — a compact trigger (current selection + "Choose/Change image" + Clear) that opens a **modal** grouped into category tabs. The `primaryCategory` tab shows first (Distinctions leads with badges, Departments/Groups lead with icons) but the rest stay browsable. Inside: a thumbnail grid + **Upload your own** (POSTed to the caller's `uploadUrl`). Badge art fills the tile (`fill`); icons use `contain` so tips/edges aren't cropped. Legacy non-image values (e.g. an emoji) render as text in the preview. The community's reusable **group icons** (`groupIconOptions`) show under their own **"Groups" tab** (rendered only when any exist) — kept out of the built-in **Icons** tab so the same art never appears under both. Props: `value`, `onChange`, `uploadUrl`, `groupIconOptions`, `primaryCategory`, `label`.
- **Manifest** (`lib/asset-library.ts`) — `BUILTIN_ASSETS: AssetLibraryItem[]` (`{ id, label, src, kind, category, source, tags }`), `AssetCategory` = `'distinction' | 'icon'`, `ASSET_CATEGORIES` (tab labels) + `orderedCategories(primary)`. Built-in art ships in `public/asset-library/{distinctions|icons}/`. Labels are kept generic (no community names). New built-in icons are appended to `BUILTIN_ASSETS`. (The community's group icons are surfaced in the picker's separate **Groups** tab, **not** merged into the built-in **Icons** category — see the Picker note above.)
- **Two libraries (SaaS direction):** *built-ins* (in code, shared globally) vs *uploads* (per-community). Post–What If, uploads move to a tenant-scoped `asset_library` table merged into the same picker — see [generalizability-log.md](generalizability-log.md).
- **Rendering** — `isImageIcon(icon)` (`lib/icon-src.ts`) decides image-vs-text everywhere an icon renders (matches `/…` built-in paths **and** `https://…` uploads), so uploaded department/group icons show as `<img>`, not raw URLs. Icon uploads normalize onto a standard frame via `lib/icon-image.ts` and live in the `group-badges` bucket under `distinctions/`, `departments/`, and `groups/` prefixes.
- **Adding built-in art (repo change):** run `node scripts/normalize-asset.js <source> <category> <id> "<Label>"` — it trims/centers/encodes a transparent-background emblem into `public/asset-library/…`, then prints a ready-to-paste `BUILTIN_ASSETS` entry. Art convention: gold emblem on transparent, **no baked rim** (the UI frame supplies the ring).
- **Departments** (`DepartmentsManager.tsx`) — the department modal's Icon field uses the picker (`uploadUrl` = `/api/admin/departments/[id]/icon`, `primaryCategory="icon"`); the old emoji text input was replaced. `departments.icon` now holds an image path/URL **or** a legacy emoji, resolved by `isImageIcon` at every render site (DeptRow, SignupSection, CommitmentsSection, the profile role circle, `MemberSignupCard`, `RoleRequestsSection`).

**Key files:** `app/admin/AssetImagePicker.tsx`, `lib/asset-library.ts`, `lib/icon-src.ts`, `public/asset-library/`, `scripts/normalize-asset.js`, `lib/icon-image.ts`; consumed by `DistinctionsManager.tsx`, `DepartmentsManager.tsx`, `GroupsManager.tsx`; upload routes `app/api/admin/{distinctions,departments,groups}/[id]/icon`.

### Notifications

**Admin notifications** (`admin_notifications`): triggered by new applications, volunteer signups, role suggestions.  
**User notifications** (`user_notifications`): triggered by application status changes, role suggestion decisions, and new messages.

User notification `event_type` values and their bell link destinations:

| `event_type` | Bell link |
|---|---|
| `application_approved` | `/profile` |
| `application_rejected` | `/apply` |
| `role_suggestion_approved` | `/profile#role-signup` |
| `role_suggestion_rejected` | `/profile` |
| `role_request_approved` | `/profile` |
| `role_request_rejected` | `/profile#role-signup` |
| `volunteer_approved` | `/profile` |
| `new_message` | `/messages/[senderId]` (or `/messages` if no sender in details) |

Both support:
- Per-item mark-as-read
- Mark all as read
- Delete all (admin only)
