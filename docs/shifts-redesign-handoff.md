# Handoff: Schedule & Shifts redesign

> **⚠️ Historical document (2026-07-01, pre-build).** The redesign it hands off was designed *and built* the same day — "nothing is built yet" below is no longer true, and several file/model details changed during design (event-type registry → shift types; participation lives on events). Current state: [shifts-redesign.md](shifts-redesign.md) (status + addendum), [features.md → Shifts](features.md). Kept for context only.

Paste at the start of a new session. Project root: `ManyHands/`.

## What this is
A redesign of the **event schedule + shifts** system. The full spec lives in **`docs/shifts-redesign.md`** — read it first. Design was agreed in conversation on 2026-07-01; **nothing is built yet.** It began as a bug report (an admin "calendar" vanished after toggling shift signup) but Chanté chose to redesign rather than restore the old behavior.

## The model that's been decided (summary — details in the spec)
- Schedule items get a **participation type**: **Info** / **Shift** / **Mandatory**.
- **Shift categories** are data, not hardcoded Setup/Teardown/Decor/Volunteer. Each category is either *bound to a group* (contribution — being in the Teardown crew means you owe a teardown shift) or *required of everyone* (volunteer). A **shift** = a real-dated slot with capacity inside a category.
- The requirement lives **on the category**; **attunement reflects/cascades it** — never a second hand-wired task (avoids two-sources-of-truth drift). The `shift` attunement requirement becomes "≥1 shift in every owed category" (was: one global boolean).
- Attunement shows **one expandable line per concept** ("Shifts scheduled" → Teardown ✓ · Volunteer ☐), hidden when nothing is owed; requirements presented as a **sequence** (join crew → unlocks pick-your-time).
- **Mandatory** = an applies-to-all flag; **acknowledgement** is a *per-event admin toggle* (on ⇒ attunement gate "I'll be there"; off ⇒ just loud on the schedule). What-If mandatory events: Arrival & Orientation, Glåüm Initiation Ceremony.
- Retires two current constraints: the **hardcoded Thu–Sun/July-23–26 grid** (`app/profile/SignupSection.tsx` `CALENDAR_DAYS`) and **one-shift-per-member** (`camp_signups`). Removes the dead `shifts` table + `/api/admin/shifts` routes.

## The agenda for THIS session (the open branch)
**Resolve the last fork that changes the data shape:** is **Volunteer** just another shift category, or do volunteer shifts **hang off the existing roles/departments system** (pick a role → its shifts are the volunteer slots)? Everything else can proceed without this; the schema can't. Decide this, then either sketch the data model / admin surface or start scoping an implementation.

Also still open (lower stakes): admin editing surface (calendar grid vs date-aware list — Claude to recommend); whether picking a contribution shift auto-joins the matching group (leaning: keep join + schedule distinct).

## Constraints from Chanté (hold these)
- Keep the UX **intuitive, not overcomplicated** — every "several sub-items" idea uses the same one-expandable-line shape.
- **Don't end up as a What-If-specific implementation** — category names, mandatory flags, requirements are all data. New Glåüm/What-If hardcodes → append to `docs/generalizability-log.md` (4 rows added 2026-07-01).
- This is a **design discussion first** — talk it through; don't jump to code without agreeing the model. Chanté prefers prose over multiple-choice menus for open design questions.

## Orientation (current code)
- **Program/shift editing:** `app/admin/ScheduleManager.tsx` (a list; the shift-signup toggle `ShiftSignupToggle.tsx` sits above it in Admin → Program → Schedule). Backing table `schedule_events`; a "shift" today = a row with a non-null `capacity`.
- **Member shift picker:** `app/profile/SignupSection.tsx` (`ShiftPicker`) on `/signup`, gated on `shiftSignupOpen` + the hardcoded day grid. API `app/api/signup/route.ts`. Signups in `camp_signups` (`role_id`, single `schedule_event_id`).
- **Attunement:** `lib/attunement.ts` (`buildAttunementChecklist`, requirement types incl. `shift`, `collection`, `role`); task shape + defaults in `lib/site-config.ts` (`AttunementTask`); flag `config_shift_signup_open` in `page_content`.
- **Contribution groups:** `lib/groups.ts`, `lib/group-collections.ts`, `GroupsManager.tsx`; a category "bound to a group" points at one of these. See `docs/features.md` → Groups.
- **Roles/departments:** the parallel system the open branch is about — `app/api/signup/route.ts` reads `departments` + `roles`; member picker in `SignupSection.tsx`.
- **Dead code to remove in the redesign:** `shifts` table, `app/api/admin/shifts/{route,[id]/route}.ts` (nothing calls them).

Stack + conventions: see the root `CLAUDE.md` (Next.js 16 App Router, Clerk, Supabase, Vercel). Don't touch port 3000 (Chanté's); use 3001 if a server is needed, and stop it after verifying.
