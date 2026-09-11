# UX Review Log — Admin Console

Running log of findings from the recurring UX-adviser pass. Each finding carries a
**Severity** (how much it hurts an organizer using the console), an **Effort** guess,
and a **Status** (`proposed` → Chanté decides → `fix agreed` / `fixed` / `dismissed`).
Newest review at the top. Fixes are only applied once agreed.

---

## Review — 2026-07-20 (the new volunteer-shifts surfaces: unified Pending Review queue + volunteer self-serve `/participate`, `/profile`)

Scope: the volunteer-shifts work that landed 2026-07-16 (`a468ee4`) — the unified
Pending Review queue on Admin → Community (member applications + volunteer signups
in one list) and the volunteer's own self-serve shift surfaces (`/participate`
shifts-only, `/profile` "Your Shifts"). Read-only, against `origin/main`. This is
the first pass over these surfaces; they read well overall (the tag language on the
queue is a clean solution to the "Vera hid in a collapsed section" problem, and the
`hideRole` plaque collapse on the volunteer profile is tidy). Three seams below.

### 28. The unified Pending Review queue is two different UIs stacked in one list · Severity: medium (cohesion) · Effort: small–medium · Status: **fixed 2026-08-02** (`session/2026-08-02-board-queue`)

The queue (`app/admin/page.tsx` `pendingQueue`) interleaves member applications and
volunteer signups, newest-first, each tagged Member/Volunteer — the right call. But
the two row types are built from unrelated components and behave nothing alike, so
scanning the list means switching mental models row to row:

- **Interaction model differs.** A member row (`ApplicationRow`) is a *link* — the
  whole card navigates to `/admin/[id]` — with Approve/**Reject** always visible in
  an `AdminActions` cluster beside it. A volunteer row (`PendingVolunteerRow`) is an
  *expander* — clicking it opens an inline panel, and Approve/**Decline** live hidden
  inside that panel. So in the same list, one row type acts on one click and the other
  needs a click-to-expand-then-act. (Structural cause: members have a dossier page,
  volunteers don't — but the queue doesn't have to expose that difference as two
  interaction grammars.)
- **Destructive guard is inconsistent, and backwards.** Declining a volunteer pops a
  confirm dialog (`useConfirm`, `danger`); **rejecting a member application fires
  immediately with no confirmation** (`AdminActions.handleReject` → straight to the
  reject endpoint, which emails the applicant). The higher-stakes, harder-to-walk-back
  action — sending a person a rejection — is the *unguarded* one, right next to the
  guarded lighter one. At minimum member Reject should confirm too.
- **Verb split.** "Reject" (member) vs "Decline" (volunteer) for the same gesture in
  one queue. Defensible on its own, but combined with the two points above it reads as
  drift, not deliberate register.

Cheapest coherent fix: give member Reject a confirm dialog (closes the sharpest
gap on its own), and — when next touched — align the two rows on one affordance
(either both expand-to-act, or both show actions inline), so the queue reads as one
list of one kind of thing-to-do.

### 29. A volunteer landing on `/participate` before shifts exist hits a promise-with-no-payoff dead end · Severity: medium (empty state) · Effort: small · Status: **fixed 2026-08-02** (`session/2026-08-02-board-queue`)

`/participate` is the *entire* participation surface for a volunteer (no roles,
groups, or resources — shifts only). The page (`app/participate/page.tsx`) heads it
"Your Shifts / Lend your hands where they're needed — pick the shifts that work for
you. You can change your mind anytime," then renders `SignupSection hideRole`. But
the shift picker *and its closed-state explanation* are both gated behind
`shifts.length > 0` (`SignupSection.tsx:1387`). When no shift occurrences exist yet
(pre-schedule) the volunteer sees: the inviting heading, a "None yet" card, and
nothing else — no picker, no "signup opens once the schedule is set" note, no
onward action. The copy actively promises shifts to pick that aren't on the page.
Members are cushioned (the rest of `/participate` still has content); for a volunteer
this is a blank surface that contradicts its own header. Fix: when
`shifts.length === 0`, show the same "Shift times aren't confirmed yet — check back
soon" reassurance the closed-but-populated state already uses, so the volunteer's one
page always explains itself.

### 30. The volunteer `/participate` view says "Your Shifts" twice, inches apart · Severity: low (visual seam) · Effort: trivial · Status: **fixed 2026-08-02** (`session/2026-08-02-board-queue`)

On the volunteer participate view the page `h1` is "Your Shifts"
(`app/participate/page.tsx`), and the very next element — the `CurrentSignupCards`
shift plaque — carries its own kicker "✦ Your Shifts ✦" (`SignupSection.tsx:249`).
Two identical titles stacked with only a hairline divider between them. Fine on
`/profile` (where the plaque sits under a different page title) and on a member's
`/participate` (where it's one card among many), but on the volunteer's shifts-only
page the repetition is bare. Either drop the page `h1` to a subtitle-only intro, or
retitle the volunteer page header (e.g. "Lend a Hand") so the plaque's "Your Shifts"
isn't an echo.

## Review — 2026-07-14 (empty-state voice audit — member surfaces)

Scope: a cross-cutting read of every member-surface empty state (radio, messages,
members, profile tasks/shifts/resources, home teaser, schedule), judged against
design-philosophy §5 ("Copy carries philosophy too… never corporate") and the
existing calibration references. Read-only, `origin/main` @ `4ee6d73`. This is a
*voice*-consistency pass, not a "add jokes everywhere" pass — §5 also says calm is
a feature and one wink per page is enough. The finding is that the surfaces have
drifted into two registers, and the flat one reads like a different app.

The app already contains its own calibration references — these get it right:

- Radio feed empty: **"The airwaves are quiet — nothing on the air yet."** + the
  **"✦ That's all for now. Stay tuned. ✦"** sign-off (`RadioFeed.tsx`).
- Profile tasks: **"You're all set. Nothing left to do for now."** (`TaskStatus.tsx`).
- Profile shift (pre-schedule): **"Shift signup will open here once the schedule is
  set — check back soon."** (`SignupSection.tsx`).
- Member resource lists: **"Nobody yet — be the first."** (`ResourceCommitments.tsx`).
- Home digest: **"All quiet — N days to camp."**; schedule teaser: **"The schedule
  begins Wednesday, July 22."** (both fixed in earlier passes).

Against those, a cluster of member empty states reads as generic UI-kit boilerplate.

### 26. Member empty-state copy has split into two registers · Severity: low-medium · Effort: small · Status: **fixed 2026-08-02** (`session/2026-08-02-board-queue`)

The laggards, all member-facing:

- `/messages` inbox, no conversations: **"No messages yet."** (bare — the warmer
  `MessagesInboxClient.tsx` button beneath it, "Start a conversation", already
  carries the invitation; the sentence above it is dead weight).
- `/messages` new-message member search, no matches: **"No members found"**
  (`MessagesInboxClient.tsx`).
- 1:1 thread: **"No messages yet. Say hello!"** (`ThreadClient.tsx`); group thread:
  **"No messages yet. Start the conversation!"** (`GroupThreadClient.tsx`) — the
  "Say hello!" / exclamation-mark register is *casual-generic*, a different voice
  from the deadpan ceremonial warmth everywhere else (cf. the radio sign-off).
- `/members`, no approved members: **"No approved members yet."**; after filtering:
  **"No members match your filters."** (`MembersGrid.tsx`).

None of these are wrong or broken — they're the calm-plain default. The issue is
that a member moving from Radio (witnessed, gilded, "airwaves are quiet") to
Messages/Members drops into flat app-speak, and the seam is visible. The fix is
cheap: bring the laggards to the register the app already models — not a wink on
each, just the house's straight-faced warmth. It's a copy-only sweep (no layout),
so effort is small; worth batching with the next Messages or Members touch rather
than a standalone commit.

### 27. The Many Hands directory earns the reciprocity register most of all · Severity: low · Effort: trivial · Status: **fixed 2026-08-02** (`session/2026-08-02-board-queue`)

`/members` is the app's hands-territory surface (§2: "the directory, anything a
member *does* for the whole") — the one place the plainest empty copy sits.
"No approved members yet." is the true-empty case; "No members match your filters."
is a no-results-after-filter case (philosophy tolerates plainer there — it's a
search result, not a threshold moment). But the true-empty line in particular is a
missed reciprocity beat on the surface named for it. A single warm line in the
"Many Hands" voice ("The circle's still gathering." / similar — Chanté's phrasing)
would close the gap with `ResourceCommitments`' "Nobody yet — be the first." No
new wink budget spent; it replaces one flat sentence with one warm one.

---

## A5 second half — 2026-07-08 (`feat/roster-links-radio-filters`)

**Status: fixed.** Member names across the admin console now link to their
`/admin/[id]` dossier, matching the gold/subtle style already used by
`VolunteersSection`'s "View full application →" link. `/admin/[id]` keys on
`applications.id`, not `clerk_user_id` or `members.id` — surfaces that only
had a `clerk_user_id` needed a small join added to thread the id through:

- **Group rosters** (`GroupsManager.tsx` `Roster`) — `GET
  /api/admin/groups/[id]/members` now also selects `applications.id` and
  returns it as `application_id`; the roster name is a link when present.
- **Shift rosters** (`ScheduleManager.tsx` `ShiftRosterLine`) — each holder
  chip is already the lead-toggle button, so a small ↗ affordance was added
  beside the name instead of overloading the click handler. `getAdminRosters`
  (`lib/admin-program-data.ts`) resolves `application_id` via a new shared
  helper, `applicationIdsByClerkId` (`lib/member-names.ts`), alongside the
  existing `memberDisplayNames`.
- **Overview** (`MemberPills`, `MembersDropdown`) — the `id` was already
  selected by the page's `applications` query; this was UI-only.
- ~~Shared Resources claimants~~ — obsolete before it landed: the admin
  resources console (`ResourcesManager.tsx`) was removed the same day when
  Shared Resources pivoted to member-owned authoring on `/participate`, so
  there is no admin claimant surface to link from.

Not covered this round (found during the sweep, out of the four listed
surfaces — flagged for a follow-up pass if it still bothers her):
`AdminsManager`/`PollManagersManager` (Configure) name rows, and the
`RoleRequestsSection`/`RoleSuggestionsSection` applicant names, which need a
similar small join added at their data source.

---

## Review — 2026-07-03 (mobile pass: full site at ~390px, fixes applied same day on `ux/mobile-overflow`)

Method: browser window clamps at 512px, so true phone width was tested via a
same-origin 390px iframe harness plus a programmatic per-page overflow scan
(every element's rect vs. viewport). Member pages (`/`, `/schedule`,
`/participate`, `/roles`, `/profile`, `/members`, `/messages`) all scanned clean —
the real findings clustered on Admin → Program. Common root cause: manager rows
are non-wrapping flex with fixed-width trailing action clusters, so at phone
widths the text column gets crushed to a sliver (one-word-per-line towers) and
the actions get pushed past the viewport edge. Fix pattern applied everywhere:
`flexWrap: 'wrap'` on the row + a `flex: '1 1 ~10rem'` basis on the text column
(triggers the wrap before the text crushes) + `marginLeft: 'auto'` on the action
cluster (right-aligns it when it wraps; no-op on desktop).

### 21. Admin schedule list: Edit/✕ pushed off-screen on phones · Severity: high (mobile-only) · Effort: small · Status: **fixed 2026-07-03**

`ScheduleManager.tsx` `EventRow`: ✕ clipped or fully off-screen (untappable) on
every row at 390px; on rows with longer type pills (Mandatory/Service) Edit was
half-cut too (~35 elements past the viewport edge). Fixed with the wrap pattern.

### 22. One-word-per-line text towers in Program manager rows · Severity: medium (mobile-only) · Effort: small · Status: **fixed 2026-07-03**

Lead-up gathering rows ("6:00 PM / · / 755 / East / …" — with "Notified Jul 3"
colliding into the address column), the recurring-event row's pinned-days list,
the Lead-Up manager's intro-paragraph-vs-button header, and Shared Resources
list headers/items all crushed their text columns into tall towers. Same wrap
pattern across `LeadUpGatheringsManager.tsx` and `ResourcesManager.tsx`.

### 23. Hidden-scroll day rails: last days undiscoverable · Severity: medium (mobile-only) · Effort: trivial · Status: **fixed 2026-07-03**

Both the member `/schedule` day tabs (`ScheduleCalendarClient.tsx`) and the admin
schedule day-chip rail used `overflowX: auto` with no affordance — at 390px SUN
was half-clipped and MON fully hidden; a member could plausibly never find the
last two camp days. Changed both to `flexWrap: 'wrap'` so every day is always
visible (two rows on phones, unchanged single row on desktop).

### 24. Floating "✎ Edit Page" pill covers homepage text on phones · Severity: low · Effort: trivial · Status: **fixed 2026-07-03**

The admin-only FAB (`HomePageEditor.tsx`) sat on top of announcement/body text at
phone widths. Now collapses to a small ✎ disc under 640px (label hidden via a
scoped media query); unchanged on desktop.

### 25. Admin week grid: fixed ~690px width inside horizontal scroll · Severity: low (advice) · Status: proposed

`ScheduleWeekView.tsx` shows ~2.5 of 6 day columns at 390px and horizontal panning
fights drag-to-reschedule on touch. Functional (it scrolls), and admin-on-desktop
is the primary use — flagging, not fixing. A mobile fallback could reuse the
member calendar's day-tab + single-column pattern if this ever hurts for real.

---

## Review — 2026-07-03 (sixth pass: cohesion audit — what's working)

Scope: a full desktop walk of the member surfaces (home, /schedule, /members,
/participate, /profile, /roles) and all four admin tabs, read against
`docs/design-philosophy.md`. Purpose of this pass: record what is *cohering* so
it's preserved deliberately rather than by luck, and catch the seams. Doc
syncs landed alongside (`design-system.md` caught up to the shipped UI).
Mobile-width remains blocked in the review browser (window resize ignored —
macOS full-screen state again); a separate `ux/mobile-overflow` branch exists,
so mobile is being handled there.

### What's working — keep doing this

1. **One colour source is visibly paying off.** The main schedule grid, the
   personal calendar, the Participate shift picker, its requirement chips
   ("Decor 0/3h") and its legend all speak the same hue language because they
   all read `lib/shift-colors.ts`. Nothing has drifted. Any new surface that
   colours an event must go through that module — never a local palette.
2. **The regal icon register reads as one voice.** Schedule event cards, the
   role-picker medallions, commitment rows, and department seals all render
   through `IconImage` on the normalized frame — consistent optical size,
   nothing poking out of round masks. The one-renderer rule held through the
   icon sweep; keep routing every icon `<img>` through it.
3. **Trinity language has landed in the chrome, not just the art.** Each admin
   tab subtitle carries its register (Configure: "Define the forms, fields,
   recognition, and structure the camp runs on" — triangle; Overview's
   needs-attention digest — eye; Participate — hands/reciprocity). The runway
   strip + digest orient an organizer in seconds.
4. **One wink per page holds.** "All times approximate. Attunement occurs
   continuously. Results may vary." (schedule) · "sponsored by Shrimp™"
   (header) · Department of Tiny Hand Services. The ceremony around each wink
   stays straight-faced, which is exactly the silly-sacred setpoint.
5. **The profile registry is the strongest page in the app** — the parchment
   attunement seal against the ink commitments card, the tiered commitments
   copy ("3h is the expectation — you've pledged 9h more. Many hands indeed."),
   the stat list. It's the calibration reference for future member surfaces.
6. **Collapsed-by-default admin sections read as a table of contents** (finding
   6's fix proved out — Members tab scans in one screen).
7. **Resolved from the fifth pass:** the nav label/URL mismatch is gone —
   `/signup` now redirects to `/participate`.

### 21. Two departments still wear the ✦ fallback instead of a struck medallion · Severity: low (visual seam) · Status: proposed

Logistics & Material Relocation and Nourishment have no `departments.icon`, so
the role picker and the Registry of Roles chips show the plain ✦ ring beside
five sculpted-gold seals — the one inconsistency on the app's most icon-forward
surfaces. Data, not code: the library already holds candidates
(`covered-wagon.webp`, `fruit-bowl.webp`), or fresh subjects strike in minutes
via `scripts/strike-icon.py`. Needs Chanté's pick, then set in admin.

### 22. The hands margin ornament is pasted inline on ~10 pages · Severity: low now, medium for multi-tenant · Status: proposed

The fixed `hands-left.svg`/`hands-right.svg` margin art is a duplicated inline
`<img>` block in profile, members, messages (×3), all four admin tabs, the
volunteer form, and the track picker — against the philosophy's own rule that
ornament enters the UI through centralized, swappable components
(design-philosophy §5). Extract a shared `<PageOrnament />` next time any of
those pages is touched; row added to `generalizability-log.md`.

### 23. Overview's "Shift Hours (3 per member)" survived the shifts redesign · Severity: medium (dashboard accuracy) · Status: proposed (upgrade of finding 8's watch)

The section still assumes a flat 3 h/member (`HOURS_PER_MEMBER = 3`), but
requirements now live on groups/roles/attunement tasks and members hold many
shifts — Chanté alone shows 6/3h with three group commitments. "Total
committed / still pending" is now derived from a fiction. Rebuild the section
on the same requirement derivation the attunement checklist uses
(`lib/attunement.ts`), or drop the hours cards until it can be done right.

### Content notes (yours, no code)

- Home quick-link card "Role & Shift — Choose your role and shift" points at
  the same place the nav calls "Participate" — two names for one destination;
  the card copy is editable inline (Edit Page).

---

## Session close-out — 2026-07-02 (evening)

### 19. `/admin/[id]` URL says nothing about what it is · Severity: low (advice) · Status: proposed

Chanté (the app's own author) mistook an `/admin/<uuid>` link for the public
profile — three person-views exist (`/admin/[id]` admin dossier, `/members/[id]`
public profile, `/profile` own profile) and the admin one's URL self-describes
least. Proposal: rename to `/admin/member/[id]` with a redirect from the old path
(notification emails link to it), whenever routes are next touched.

### 20. Orphaned `cf_*` keys in `member_profiles.values` — investigated · Status: resolved (explained); cleanup proposed

The ~8 members carrying raw `cf_*` keys (noticed in the 2026-07-02 morning pass):
all four keys map to live form fields ("Current Attunement Status", "Confirmation",
"Preferred Role", "Space Requrements") whose `profileFieldKey` binding is now null.
They're relics of the profile catch-up seeding; the values duplicate
`applications.custom_answers`, render nowhere, and orphan nothing. **Proposed
cleanup (needs Chanté's go-ahead, ~5-line script):** strip `cf_*` keys from
`member_profiles.values` so stored profile data is exactly the registry's schema.
Harmless to leave; mildly confusing to future debugging if kept.

### Content note

- Form field label "Space Requrements" (member-facing, apply form) — typo for
  "Space Requirements". **Fixed 2026-07-11** — renamed in the prod Application
  Builder (What If Plans section); label edits rename safely.

---

## Tier A implementation — 2026-07-02 (from docs/admin-ux-handoff.md, `feat/admin-ux-tier-a`)

Chanté asked for the handoff brief's work to begin. Tier A shipped this round
(browser-verified, zero new config):

- **A1 — "Needs attention" digest** atop Overview (`lib/admin-attention.ts` +
  Overview card): up to five prioritized actionable lines (pending applications /
  volunteers / role requests / role suggestions / un-notified upcoming gathering),
  each with a verb deep-link. Empty state: "All quiet — N days to camp."
- **A2 — runway strip** inside the sticky `AdminNav` on all four admin surfaces:
  "✦ 20 days to camp" + next dated milestones (upcoming gatherings, camp start),
  each a jump link.
- **A3 — verb-ified counts (scoped)**: Overview's "N pending review" → "Review N
  pending →"; "In no group" card gained "Assign in Groups →". The A1 digest carries
  most of the verb duty; further sweeps as sections get touched.
- **A5 — cross-reference chips** on `/admin/[id]`: role/department (purple), each
  group, and "N shifts held" (anchors to the Role & Shift section) as linked chips
  under the header.

**Deferred to next round:** A4 (sticky scroll-spy section sidebar), A5's second half
(member names elsewhere linking consistently to `/admin/[id]` — rosters need ids
plumbed — **fixed 2026-07-08**, see "A5 second half" above), and all of Tier B
(queue mode first).

---

## Review — 2026-07-02 (fifth pass: Messages, Participate, Profile)

Scope: the remaining member surfaces — /messages inbox (threads left unopened to
avoid marking reads), /signup (Participate), /profile. Mobile still blocked
(Brave full-screen). **Clean bill overall — no code changes this pass.** Notes:

### 18. Joining several groups stacks shift requirements · Severity: question for Chanté · Status: **resolved 2026-07-02** (decision + build, `feat/commitment-tiers`)

**Decision (Chanté):** "Attuned" = the authored minimum only; commitments the
member chose still show as a guide to meeting them. **Built:** checklist items now
carry a tier — required (gates the seal) vs commitment (group/role-derived, shown
under "Your Commitments" with a celebration line: "3h is the expectation — you've
pledged 9h more. Many hands indeed."). Home banner counts them separately ("1
outstanding task · 3 commitments"); Participate group rows disclose their
commitment up front ("✦ carries a 3h Setup shift commitment"). Decision recorded in
docs/shifts-redesign.md. Original finding follows:

Chanté's own attunement checklist shows four unchecked shift items — "Shift
Assigned 0/3h" (global Service) plus Decor/Setup/Teardown 0/3h each from her three
group memberships = **12 owed hours** for one member. The mechanics work exactly as
designed (`groups.required_shift_type_id` + the global task); the question is
policy: is requirement *stacking* intended for multi-group members, or should the
checklist cap/merge (e.g. "3h in any owed type")? Feeds the shifts redesign.

### Smaller notes

- Nav label "Participate" → URL `/signup` — label/URL mismatch; harmless, not worth
  breaking links; consider a rename-with-redirect during the shifts redesign.
- Member Profile Details uses an explicit Save button while admin Configure
  sections autosave — fine: members are one-shot editors, admins live there.
- Messages inbox (filters, sent-state, group avatars), the Participate shift picker
  (capacity "4 of 5 open"), and the profile registry page all read beautifully.
- Prod verified after ship: rounds 1–4 live on camp.glaum.ca (Overview title,
  teaser copy confirmed live).

---

## Review — 2026-07-02 (fourth pass: member-facing flows)

Scope: the member-facing side as an organizer's members see it — home dashboard,
/schedule, /members — cross-checked against admin state. Mobile-width still blocked
(Brave in macOS full-screen; un-fullscreen before next pass). Fixes landed on
`ux/round-4`, verified in the browser.

### 16. Members could RSVP to gatherings that already happened · Severity: medium-high · Status: **fixed 2026-07-02**

The member API (`/api/lead-up-events`) had no date filter, so /schedule showed the
past Jul 1 gathering with a live "I'll be there" button (the home teaser already
filtered correctly — the two disagreed). **Fixed:** past gatherings drop out of the
member API (dateless ones stay), and the RSVP endpoint itself now rejects past
gatherings (400) so nothing can write an RSVP to history. The member-facing
behaviour now matches the admin list's Past treatment.

### 17. Home teaser claimed "Nothing scheduled yet" while a full schedule exists · Severity: medium · Status: **fixed 2026-07-02**

The Upcoming Gatherings widget only shows events within the next 14 days; with camp
3 weeks out it rendered "Nothing scheduled yet." — factually wrong (14 events exist)
and mildly alarming for members. **Fixed:** when dated future events exist beyond
the window, the empty state now reads "The schedule begins Wednesday, July 22."
(derived from the first future event, so it stays correct for any community).

### Notes (no action)

- The Admin link lives in the avatar dropdown (with About), not the main nav —
  deliberate-looking and fine for a single-admin community; revisit if more admins.
- The stale "Shifts Currently Closed" announcement is the most prominent thing on
  members' dashboards right now (content, Chanté's call).
- Member-facing pages otherwise read beautifully — the dated schedule calendar,
  Many Hands directory with search/filters, and dashboard widgets all hang together.

---

## Follow-up — 2026-07-02 (morning)

### 15. Deleting/recreating a profile field silently strands form answers · Severity: high (data loss) · Status: guardrail **fixed**; data repair **done 2026-07-02**

Found while chasing the `eventExperience` / `gatheringsAttended` double-up: renaming
a profile field keeps its key (safe), but **delete-and-recreate mints a new key**,
and any apply-form field still bound to the old key keeps writing answers to a key
nothing displays. Worse, the builder's "Saves to" dropdown silently rendered the
dangling binding as "This application only", hiding the problem. Live impact: the
"camped before" form field writes to the deleted `eventExperience`; one member has a
stranded value.

**Fixed (guardrail):** the builder now shows a dangling binding as
"⚠ missing field: <key>" with an amber warning and instructions — picking a real
field (or "This application only") repairs the config in place.

**Data repair (approved & run 2026-07-02):** the camped-before form field now saves
to `gatheringsAttended`; the one stranded `eventExperience` value turned out to
duplicate an existing `gatheringsAttended` value, so the dead key was simply removed
(nothing overwritten). Verified: no `eventExperience` remains anywhere.

**Also noticed:** `member_profiles.values` holds raw `cf_*` keys for ~8 members
(not in the registry, so invisible) — likely from an earlier catch-up migration.
Worth a look someday; not urgent.

---

## Overnight fixes — 2026-07-02 (approved: "do all relevant fixes, best judgment")

All verified live in the browser against the dev server, tsc-clean, dev server
stopped afterwards. Everything below is uncommitted in the working tree.

- **Finding 6 → fixed.** `CollapsibleSection` now remembers each section's
  open/closed state in `localStorage` (keyed by title). Chose persistence over
  flipping the default: nothing changes until you collapse something, and then the
  console keeps your arrangement across visits. Verified: collapsed Registered
  Hands, hard-reloaded, still collapsed (then restored it).
- **Finding 7 → fixed.** Distinctions converted from its lone "Save changes" button
  (which sat below the fold of a long editor) to the same debounced autosave +
  transient "Saved ✓" used by Attunement Tasks / Event Dates / Profile Fields.
  Every inline Configure section now saves the same way. Note: the manual save was
  originally deliberate (commented as such) — if autosaving rule edits feels too
  live, easy to revert.
- **Finding 13 → fixed.** `/admin/[id]` no longer shows profile-backed application
  answers twice: fields wired via `profileFieldKey` render once, in Profile Details
  (the canonical value). If the member has no canonical value yet (e.g. pending
  applicant), the application answer still shows. Follow-on bug caught in
  verification: the skipped answers initially resurfaced under "Additional
  Responses" with raw keys — fixed by marking them handled for the orphan sweep.
- **Past gatherings (from finding 14) → fixed.** A gathering whose date has passed
  now renders dimmed with a "Past" tag and loses its Notify button (no alerting
  members about something that already happened). Verified on the Jul 1 gathering.
- **Mobile-width pass → attempted, blocked.** Chrome ignored window resizes
  (390 and 500px) — the window appears to be in a macOS tiled/full-screen state I
  didn't want to fight overnight. Still the top item for next pass, ideally via
  responsive dev tools or a real device.
- Content notes from finding 14 (Prostelatizing typo, stale "Shifts Closed"
  announcement) are **data, not code** — left for Chanté.

---

## Review — 2026-07-02 (second pass, live walkthrough + fixes)

Scope: first *visual* pass — drove the real console in Chrome against a local dev
server (port 3001) with Chanté's session: Manage, Overview, Configure, the
Application Builder, and the `/admin/[id]` member detail page. Verified iteration 1's
five fixes render correctly in the browser. Fixes below were applied same-day
(approved mode: "keep resolving, use judgment").

### 9. A failed section load looks identical to "you have nothing" · Severity: high (systemic) · Status: **fixed 2026-07-02**

Every client manager treated a failed initial fetch as an empty list. Observed live:
Manage → Schedule rendered **"No events yet"** while 14 events existed (the fetch
had failed during the dev server's cold compile). An organizer seeing that would
reasonably re-create events — duplicates — or panic. The pattern was in eight
components.

**Fixed:** shared `app/admin/LoadError.tsx` ("Couldn't load this section — … Retry")
now renders on initial-load failure, distinct from the true empty state, in:
ScheduleManager, LeadUpGatheringsManager, AnnouncementsManager, ShiftTypesManager,
RoleRequestsSection, RoleSuggestionsSection, DepartmentsManager, GroupsManager.

### 10. The PWA service worker was poisoning local dev — root cause of the "clicks die" gotcha · Severity: high (dev-only) · Status: **fixed 2026-07-02**

`public/sw.js` cached every same-origin `.js` **cache-first, forever**. Safe in prod
(content-hashed chunk names) but in dev the chunk paths are stable across edits, so
one visit poisoned the browser: stale bundles kept serving old code through `rm -rf
.next`, restarts, everything. Found because an InstallPrompt fix refused to appear.
This is almost certainly the documented "HMR goes stale and the page renders but
clicks die" gotcha.

**Fixed:** `sw.js` no-ops on localhost + cache bumped to `glaum-static-v2` (activation
purges the poisoned v1 cache in every browser that ever visited);
`ServiceWorkerRegister` no longer registers in dev and actively unregisters + clears
caches. Prod behaviour unchanged. `docs/session-prompt.md` gotcha updated.

### 11. PWA install banner floats over the admin console · Severity: medium · Status: **fixed 2026-07-02**

The "Install Glåüm" banner (fixed, bottom-center, z-index 9999) sat on top of the
console's bottom rows on every admin page until dismissed — it covered the
Announcements list and the builder's Test/Reset buttons during the whole walkthrough.
The nudge is for members, not for an organizer mid-session.

**Fixed:** `InstallPrompt` returns null on `/admin*` routes.

### 12. The ●/○ row button doesn't say what it does · Severity: low-medium · Status: **fixed 2026-07-02**

Schedule, Announcements, and Lead-Up rows each carry an unlabeled `●`/`○` toggle
(visibility) next to Edit/✕ — cryptic glyph, and the old tooltip just said
"Hide"/"Show" without saying *to whom*.

**Fixed:** explicit `title` + `aria-label` on all three: "Visible to members — click
to hide" / "Hidden from members — click to show". (A dedicated eye icon like the
builder's would be nicer still — cosmetic, later.)

### 13. `/admin/[id]` shows the same answer twice · Severity: low (advice) · Status: **fixed 2026-07-02** (see Overnight fixes)

Since profile became the source of truth, the detail page shows e.g. Test User's
intro text under **"Introduce yourself to Glåüm"** *and* as **Bio** under Profile
Details, and "Have you camped with Glåüm before?" duplicates **Gatherings Attended**.
Proposal: in the application sections, collapse profile-backed answers to a one-line
pointer ("→ lives in Profile Details"), or show only fields with no `profileFieldKey`.

### 14. Content notes from the walkthrough (yours to judge, no code change)

- Group "Prostelatizing" — typo of *proselytizing*? It also overlaps "Spreading the
  Word" (descriptions: "Spreading the word" / "Letting people hear") — intended?
- Announcement "Shifts Currently Closed for Sign Up - Opening Soon" (Jun 16) is
  still live while shift signup is open.
- The one Lead-Up Gathering (Wed, Jul 1) is in the past and still shows its Notify
  button; consider how past gatherings should read/retire.
- "Reset to defaults" in the builder sits beside "Test this application", but its
  confirm dialog is thorough — leaving as-is, just noting the adjacency.

### Walkthrough impressions (no action needed)

The console genuinely reads well: the three-tab nav + jump links orient fast, the
date-aware schedule list with type pills is excellent, the builder's autosave chip
("All changes saved") is the best feedback pattern in the app — worth copying to
Distinctions eventually (finding 7). Iteration 1's fixes verified live: Overview
title, dynamic Groups cards, "In no group", responsive grid, single notification
surface.

---

## Review — 2026-07-01 (first pass, report-only)

Scope: `/admin` (Manage), `/admin/overview`, `/admin/configure` — page structure,
navigation, data consistency between tabs, feedback patterns across the client managers.
Not yet covered: `/admin/[id]` application detail, the Application Builder full-screen
page, `/admin/configure/application-form`, and a real browser/mobile walkthrough.

### 1. Overview and Manage disagree about who has a shift · Severity: high · Effort: small · Status: **fixed 2026-07-01**

`app/admin/overview/page.tsx` builds its "Signup Complete" stat and the whole
Shift Hours section from `camp_signups` only (the legacy single-signup table).
`app/admin/page.tsx:46-55` unions `camp_signups` **with** `member_shift_signups`
(the many-to-many table members actually sign up through now).

**Failure mode:** a member picks a shift via the current picker → Manage shows them
holding a shift, Overview still counts them "still to complete" and their 3 hours as
"Still Pending". The dashboard the numbers are *for* is the one that's wrong.

**Fixed:** union logic extracted to `lib/shift-signups.ts` (`getShiftEventByUser()`);
both Manage and Overview now read it, so "has a shift" means one thing.

### 2. Overview's "Setup & Teardown" section reads retired data · Severity: medium-high · Effort: small-medium · Status: **fixed 2026-07-01**

The Setup/Teardown/Decor cards derive from live group membership, but the section
also reads `setup_limitations` (retired with `setup_preference` when Groups landed),
and the "Not yet answered" card is actually "belongs to no group" — mislabeled as if
it were still a form question. Group names are hardcoded, so renaming or adding a
group in Admin → Groups silently drops it from the dashboard (logged in
`generalizability-log.md` 2026-07-01).

**Fixed:** section renamed "Groups"; one card per row in the `groups` table
(sort_order-honoring, so renames/additions in Admin → Groups appear automatically);
"Not yet answered" → "In no group"; limitations card dropped along with the retired
`setup_*` columns in the query.

### 3. Overview tab is titled "ManyHands Registry" — same as Manage · Severity: medium · Effort: trivial · Status: **fixed 2026-07-01** (Overview's H1 is now "Overview")

Both `/admin/overview` and `/admin` render the identical H1, so the two tabs are
indistinguishable above the fold and neither matches its nav label. Overview's
subtitle (`X pending · Y approved`) also duplicates what Manage's subtitle says.

**Proposed fix:** title Overview "Overview" (subtitle it already has works), keep
"ManyHands Registry" on Manage only — or vice-versa, but one name per tab.

### 4. Notifications appear twice on Manage, with conflicting behavior · Severity: medium · Effort: small · Status: **fixed 2026-07-01**

Manage renders both the `NotificationBell` (top right, on all three tabs) and the
full `NotificationsSection` panel — same 20 rows. Opening the bell **auto-marks
everything read** (`NotificationBell.tsx:36-42`), which silently defuses the
panel's "N new updates" state; the panel meanwhile has explicit Mark-read/Clear
buttons. Two surfaces, two mental models, one dataset.

**Fixed:** kept the bell (it already had richer per-notification links than the
panel); `NotificationsSection` deleted. The dropdown now shows the full fetched list
(scrolls) instead of a 6-item teaser, gained a "Clear all" button (the one capability
the panel had that the bell lacked), and the now-pointless "See all in registry →"
footer was removed.

### 5. Overview's Setup & Teardown grid breaks on phones · Severity: medium (mobile-only) · Effort: trivial · Status: **fixed 2026-07-01** (folded into #2's rebuild — the Groups grid uses `auto-fit, minmax(160px, 1fr)`)

`overview/page.tsx:257` uses `gridTemplateColumns: 'repeat(3, 1fr)'` — three forced
columns ≈ 100px-wide cards on a 375px phone, with member pills wrapping into
unreadable columns. Every other grid on the page uses
`repeat(auto-fit, minmax(160px, 1fr))`.

**Proposed fix:** use the same `auto-fit` pattern here.

### 6. Manage/Configure load with every section expanded · Severity: low-medium (advice) · Effort: small · Status: **fixed 2026-07-02** (localStorage persistence — see Overnight fixes)

All `CollapsibleSection`s default open, so Manage and Configure are very long
scrolls, and the useful one-line `summary` only renders when a section is closed —
i.e. the orientation text is invisible in the default state. The jump-links help,
but the "stuck in the admin UI" feeling may partly be this wall.

**Proposed fix (pick one):** default sections closed so each page reads as a scannable
table of contents (summaries visible, one click to open); or persist open/closed per
section in `localStorage` so the console remembers how you left it. Judgment call —
flagging rather than recommending hard.

### 7. Save feedback differs between Configure sections · Severity: low (advice) · Effort: n/a for now · Status: **fixed 2026-07-02** (Distinctions → autosave — see Overnight fixes)

Three patterns coexist: debounced autosave with a transient "Saved ✓" (Attunement
Tasks, Event Dates, Profile Fields, Application Builder), an explicit dirty-tracked
"Save changes" button (Distinctions), and modal-with-Save-button (Departments,
Groups, Announcements). Modals are fine as a distinct idiom, but autosave vs.
explicit-save between *sibling inline sections* means you must notice which mode
you're in before walking away from an edit.

**Proposed direction:** converge inline sections on one mode (autosave + "Saved ✓"
matches the majority) when a section is next touched — not worth a dedicated pass.
Delete confirmations are consistent (native `confirm()`) — no action needed.

### 8. `HOURS_PER_MEMBER = 3` will be wrong after the shifts redesign · Severity: note · Status: watch

Overview's Shift Hours section assumes a flat 3 h/member. The agreed shifts model
puts required hours on shift types. No action now — the redesign should rebuild this
section; noting it so it doesn't survive by accident.

### 11. The PWA service worker was pinning stale icon art in prod · Severity: medium · Status: **fixed 2026-07-03**

Sibling of #10: `public/sw.js` matched every same-origin `.webp` as an
"immutable" static asset and served it **cache-first, forever**. The asset
library is mutable art under stable names (icons and medals get re-struck in
place), so every installed PWA kept the pre-normalization icons — new sizing
CSS + old tight-cropped art = icons overflowing their display boxes (reported
from the schedule's event-icon picker).

**Fixed:** `/asset-library/` excluded from SW caching (network + HTTP etags —
the files are ≤320px now, and Vercel serves them `must-revalidate`) + cache
bumped to `glaum-static-v3` so activation purges the poisoned entries. After
the deploy, one reload installs the new worker; the next paints fresh art.
