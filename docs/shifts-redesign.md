# Schedule & Shifts — redesign

**Status: COMPLETE — built & live-verified 2026-07-01; final cleanup (item 7) done 2026-07-08 (migration `065`)**. Migrations 045–047 applied in prod; admin + member surfaces built and browser-verified; the deliberately-deferred cleanup migration dropped the legacy columns/tables/routes + the compat shim. This doc is the design history + build record. The current-state reference lives in [features.md → Shifts](features.md), [database.md](database.md), and [design-system.md → Event Type Colors](design-system.md).

> ⚠️ **Reading order:** the sections below are chronological design history. The first model ("event-type registry" with binding+hours on the type, migration 045) was **corrected the same day** — see "Model corrected" mid-doc. The final model: fixed `participation_type` on events, a requirement-free `shift_types` registry, requirements authored on groups/roles/attunement tasks.

## Per-night occurrences (2026-07-03, migration `064`)

Recurrence (`is_recurring` + `recurrence_days`) is **purely an admin authoring convenience** — "so the organizer doesn't create the same shift six times." **Each night of a recurring shift is treated in all ways as a regular shift:** its own signup, capacity, roster, hours, and lead. A signup names its night via `member_shift_signups.occurrence_date` (NULL = the single occurrence of a non-recurring shift). There is no "series signup" concept — a member who works two Salon nights holds two rows and earns two nights' hours.

`lib/shift-occurrences.ts` is the single source of an event's concrete nights (`recurrence_days`, or every day of the configured event range for an "every day" shift), reused by the member picker (`lib/participate-data.ts`), the write path (`/api/shift-signups` validation, per-night capacity), attunement hours (`lib/shift-attunement.ts`), the admin roster (`lib/admin-program-data.ts` + `ScheduleManager` per-night breakout), the Overview ledger (`lib/shift-hours-overview.ts`, exact coverage), the personal schedule, and the attention digest. This closed the pre-064 gap where a recurring shift was one dateless signable unit (capacity per-series, roster/coverage blind to which night).

Supersedes the old "a shift is a `schedule_events` row with a capacity" model.

**Signup-destruction guards (2026-07-16, no migration).** `member_shift_signups.schedule_event_id` is `ON DELETE CASCADE` (045), so deleting an event destroys every night's signups — which is exactly what happened when a whole recurring shift was deleted just to remove one night. Two guards in the schedule admin:

- **Counted delete confirm** — `ScheduleManager.handleDelete` (list-row ✕ and the edit modal's Delete alike) counts the event's signups from the already-loaded rosters and, when > 0, escalates the confirm: "Delete *Glåüm Salon* and its 7 signups?" with the per-night spread ("across 3 nights"), an explicit no-notification warning, and — for recurring events — a pointer to the right tool ("to drop a single night, uncheck that day in Edit → Repeats on").
- **Per-night removal = uncheck the day chip, with cleanup.** Unchecking a "Repeats on" chip removes that night; its `occurrence_date`-keyed signups are now deleted with it, server-side in `PATCH /api/admin/schedule/[id]`: whenever the saved row holds a materialised `recurrence_days` subset, signups whose `occurrence_date` is not in the subset are deleted (going back to "every day" = NULL removes nothing). The client warns first with the exact count and nights before saving, and refreshes rosters after. Before this, a trimmed night kept phantom signups that hours/rosters/reminders still counted.

**All-nights-or-just-one prompts (same day, follow-up ask).** Calendar-style occurrence handling on recurring events, via a new generic `useChoice` option dialog (`app/components/ConfirmDialog.tsx`, sibling of `useConfirm`):

- **Delete** on a multi-night recurring event first asks *which*: a chooser lists each concrete night with its signup count plus "The whole event — every night". A single night routes through the trim path above (informed count confirm → `recurrence_days` minus the night → server-side signup cleanup); the whole event takes the counted cascade confirm. Single-night series and every-day series with no configured range skip the chooser (no meaningful "just one").
- **Modify** — saving field edits on a multi-night recurring event (day chips untouched) asks "All nights, or just one?". "Just Jul 24" sends `split_night` in the PATCH, which **splits the occurrence**: inserts a one-off copy of the series with the edits applied (`event_date` = the night, POST-route participation normalisation), **moves that night's signups onto the new row** (`schedule_event_id` → new id, `occurrence_date` → NULL, the one-off convention — members keep their spot, and hours/rosters/reminders follow), then trims the night from the series' `recurrence_days` ("every day" series materialise range-minus-night; a series whose *last* night was carved out is deleted outright, because an empty `recurrence_days` array would read as "every day" downstream). Chip changes in the same save skip the prompt — recurrence-shape edits are inherently series-level and take the trim path instead.
- Known edge: a reminder already sent for a night under the series' event id isn't carried to the split-off event's ledger, so that night could remind twice. Accepted — rare, and a duplicate reminder is accurate.

**One-liner:** Separate the *program* (what's happening) from *shifts* (where you're needed) and *mandatory events* (everyone attends), model shift kinds as configurable **categories** instead of hardcoded Setup/Teardown/Decor/Volunteer, and let attunement **reflect** shift requirements rather than re-declare them.

---

## Why (the current tangle)

Four overlapping concepts share one table / share nothing coherent:

| Concept | Backing data | Admin UI | Member UI |
|---|---|---|---|
| **Program** (the schedule) | `schedule_events` | `ScheduleManager` (list) | `/schedule` + home |
| **Shifts** (signable slots) | `schedule_events` **with a `capacity`** | same list — capacity is just a field | `/participate` "Choose a Shift" grid |
| **Old shifts** | `shifts` table + `/api/admin/shifts` | ❌ deleted (2026-06-23, commit `a4efcf1`) | ❌ dead — nothing calls it |
| **Lead-up gatherings** | `lead_up_events` | `LeadUpGatheringsManager` | `/schedule` |

Today a "shift" is not its own thing — it's a program event that happens to have a capacity number. Members pick **one** on `/participate` via a grid whose days are **hardcoded to Thursday–Sunday, July 23–26 2026** (`app/profile/SignupSection.tsx` `CALENDAR_DAYS`). Two constraints this redesign retires:

- **Hardcoded Thu–Sun/July grid** → shifts must carry **real dates**.
- **One shift per member** (`camp_signups` holds a single `schedule_event_id`) → members need to hold **several** shifts.

The orphaned `shifts` table + `/api/admin/shifts` routes are dead code to remove.

---

## The use case (What If)

- Members must sign up for **at least one contribution shift** (Setup / Teardown / Decor) **and at least one volunteer shift**.
- Contribution is represented by the member's **contribution group**. Being in the Teardown group *means* "I owe a teardown shift." The group says **what** you contribute; the shift pins down **when**.
- Some events are **mandatory for everyone** (Arrival & Orientation, Glåüm Initiation Ceremony) — fixed time, no slot to pick.

---

## The model (decided)

Two concepts, cleanly separated: a **configurable event-type registry** and the **dated schedule** that references it.

### Event types (configurable registry)

Every event has an **event type**. Event types are **data, not code** — same pattern as the Profile Field Registry. Each type is built on one of **three fixed behaviors** the code understands:

| Behavior | What it is | Capacity? | Member action |
|---|---|---|---|
| **General** | Just happening (communal dinner, opening circle) — optional | no | none |
| **Shift** | Signable slots; carries a **binding + required hours** | yes | pick slots until hours met |
| **Mandatory** | Applies to all members, fixed time | no | optional acknowledgement (see below) |

The three behaviors are fixed; the types built on them are unlimited rows. "Teardown", "Volunteer", "Communal Dinner", "Orientation" are all **data**, so a future organizer defines their own. "Mandatory" is a behavior meaning *applies to all* — not a shift, not bound to a group.

### Shift-type binding → the contribution requirement

A **shift**-behaved event type carries two extra fields that together create a contribution requirement:

- **Binding** — who owes it. One of: a **role**, a **department**, a **group/collection**, or **everyone**. (Roles/departments are bindable *exactly like* groups — that's the resolution of the old volunteer↔roles fork; nothing hangs off roles as a separate axis.)
- **Required hours** — how much. The unit is **hours** (decided over "≥1 shift"), so one long slot or several short ones both count; enables a future "hours contributed" display.

A concrete **event** of a shift type is a slot: real date, time window, capacity. A member's **owed set** = every shift type whose binding matches a group/role/dept they belong to, plus every "everyone" shift type. A type is satisfied when the member's held slots in it sum to its required hours.

| Event type | Behavior | Binding | Required |
|---|---|---|---|
| Teardown | Shift | Teardown crew | 4h |
| Volunteer | Shift | Everyone | 2h |
| Communal Dinner | General | — | — |
| Orientation | Mandatory | — | ack toggle |

### The schedule (one events table)

The schedule is a list of **real-dated events, each tagged with an event type** — kept in the existing `schedule_events` table, not a new `shifts` table. Shift slots are simply events whose type is shift-behaved. The old tangle ("a shift is just an event with a capacity") is gone because the event's *type* now formally declares it's a shift and carries the requirement semantics. Members go **many-to-many** over shift events (`member_shift_signups`), replacing single `camp_signups.schedule_event_id`.

**Admin IA:** event types live in **Configure** (the registry); the dated schedule lives on the **Program tab** (`/admin/program`). Two tabs by design — definitions vs. instances.

### Requirements are derived, single source of truth

A member's owed categories = *(categories bound to groups they're in)* + *(categories required of all)*. "Done" = holds ≥1 shift in each owed category.

> **The requirement lives on the category. Attunement *reflects* it — it never re-declares it.** Do **not** make the admin configure a category requirement *and* a matching attunement task by hand; that is two sources of truth that drift apart (add the category, forget the task). Attunement derives from the category defs → it **cascades**.

### Mandatory + acknowledgement (per-event admin toggle)

- **Mandatory** = "applies to all members" (the flag).
- **Requires acknowledgement** = optional sub-toggle on that event.
  - On → attunement gate; member taps "I'll be there" (reuses the lead-up-gathering "I'll be there" interaction, but can't be un-clicked).
  - Off → loud on the schedule ("★ Mandatory — everyone attends"), never blocks attunement.

---

## How it lands in attunement

Attunement today (`lib/attunement.ts`) is admin-authored tasks with a `requirement` type (`approved` · `photo` · `collection` · `role` · `shift`). Relevant changes:

- The `shift` requirement stops being a **single global boolean** ("hold *any* shift") and becomes binding-aware: **"for every shift type you owe, your held slots sum to its required hours."** Same single task in the admin's mind; per-type hours underneath.
- Requirements present as a **sequenced progression**, not loose checkboxes. Joining a crew satisfies one gate *and unlocks* the next (pick your time). A brand-new member owes only the everyone-bound (volunteer) shift + "choose a contribution"; the teardown-shift sub-step doesn't exist until they join Teardown.

**Checklist shape — one calm, expandable line per concept** (decision: **option a**, not one line per category):

```
Contribution                  ⚠     join a crew → unlocks pick-your-time
Shifts scheduled              ⚠     Teardown 4/4h ✓ · Volunteer 0/2h ☐
Mandatory events              ☐     Arrival ☐ · Initiation ☐   (only if any require ack)
```

The "Shifts scheduled" and "Mandatory events" lines **hide entirely** when nothing is owed (mirrors how the shift task hides today while signup is closed).

---

## Resolved (2026-07-01)

1. **Volunteer ↔ roles/departments.** ✅ Resolved. Shift *kinds* are a configurable **event-type registry**; a shift type's **binding** can point at a role, department, group/collection, or everyone — roles are bindable *symmetric with groups*, not a separate axis. "Volunteer" is a shift type bound to **everyone**. Roles keep working as "what's your title"; they gain nothing structurally except being referenceable by a binding.
2. **Admin editing surface.** ✅ **Date-aware list**, not a calendar grid. Shifts carry arbitrary real dates (the fixed Thu–Sun grid is exactly what's retired); a list grouped by event type with each slot a dated row scales to any range and matches the "one calm line per thing" language. Event types configured in **Configure**; dated events on the **Program tab**.

3. **Contribution group ↔ shift coupling direction.** ✅ **Distinct.** Joining a crew and scheduling a shift are two separate steps — join = the commitment, shift = the schedule. Picking a shift does **not** auto-join a group.
5. **Binding granularity — group vs. whole collection.** ✅ Binding targets are a **specific group, role, department, or everyone** — never a whole collection. A collection is just the folder the group is browsed from in the admin picker, not itself a binding target (each crew owes its own shift type / hours, which a collection-level binding couldn't express).
4. **Fate of existing pieces.** ✅ Migration path decided — see "Migration & schema" below. Dead `shifts` table + `camp_signups.shift_id` + `/api/admin/shifts` removed; legacy `contribution_type`/`event_type`(text)/`all_hands` backfilled into the registry then dropped in a follow-up migration.

*All design questions resolved 2026-07-01. (Written before the build — everything below shipped; the redesign closed 2026-07-09 with `065` applied. See the Status header.)*

---

## Migration & schema

Current `schedule_events` carries four overlapping categorical columns; the new model absorbs all of them.

| Column | Today | Fate |
|---|---|---|
| `capacity` | signable if set | **kept** — a shift slot's capacity |
| `contribution_type` | Setup/Teardown/Decor (hardcoded) | **replaced** by a group-bound shift type |
| `event_type` (text) | ''/all_hands/camp_tending/service | **replaced** by `event_type_id` |
| `event_category` | at_camp/pre_camp | **retired** (pre_camp already superseded by lead-up gatherings) |
| `event_date` | real date | **kept** |

`Setup`/`Teardown`/`Decor` already exist as `groups` (migration 030), keyed by `clerk_user_id` — exactly what a shift binding points at, so the backfill is clean.

**New shape**
- `event_types` — `id, name, behavior ('general'|'shift'|'mandatory'), binding_type ('everyone'|'group'|'role'|'department'), binding_id, required_hours, sort_order, icon`. The registry.
- `schedule_events.event_type_id` → fk `event_types`. Single driver.
- `schedule_events.requires_ack` (bool) — per-event ack toggle, meaningful only when the type is mandatory (**decided: per-event, not per-type**, so one mandatory type can have some ack-gating events and some merely loud).
- `member_shift_signups` — `clerk_user_id, schedule_event_id, created_at`, unique together. Many-to-many, replacing single `camp_signups.schedule_event_id`. (**Keyed by `clerk_user_id`** to match `group_members`/`camp_signups`; `members.id` stays canonical identity but `clerk_user_id` is the universal join key.)

**Backfill (idempotent, mirrors 030 style):** seed one **shift** type per crew bound to its group (Teardown → Teardown group, 4h), a **Volunteer** shift type bound to everyone, `all_hands` → a **mandatory** type, else **general**; set `event_type_id` on every existing event (capacity + contribution → that crew's slot; capacity + none → Volunteer slot); copy each `camp_signups.schedule_event_id` into `member_shift_signups`.

**Two-step drop (decided):** the first migration adds the new shape + backfills + stops writing the old columns; a later migration drops the dead `shifts` table, `camp_signups.shift_id`, and `contribution_type`/`event_type`/`all_hands` once verified live. Safer rollback on a high-stakes prod DB.

---

## ⚠️ Model corrected (2026-07-01) — read this first

The sections above describe an earlier model where the requirement (binding + hours) lived **on the shift/event type**. That was wrong: **required-ness is not a property of a shift kind** — the same kind of shift can be optional (a Tea shift) or required (Service). Corrected model:

- **Shift types** are requirement-free *kinds* of shift (Setup, Teardown, Decor, Service, Tea). This is the configurable registry (renamed from "Event Types").
- **Each event has a participation type** — `general` | `shift` | `mandatory` — a fixed field, not a registry. A `shift` event picks a shift type.
- **Requirements are authored by owner:** *conditional* → on a **group or role** (`required_shift_type_id` + hours); *universal* (everyone) → an **attunement task**. A shift type nothing requires = simply available/optional.
- **Attunement composes** the owed requirements (universal tasks + derived group/role) plus the participation task ("select a contribution"). The join→owe-hours dependency shows as a sequence.
- Roles carry the same optional requirement as groups (symmetric).

Migrations: `045` (applied) seeded the first shape; **`046`** reshapes to the above (`shift_types`, `schedule_events.participation_type`+`shift_type_id`, `groups`/`roles` requirement columns). 045's `event_types`/`event_type_id` are left dormant, dropped in final cleanup.

## Build plan (phased)

Each phase is independently build-verifiable (`tsc` clean) and leaves prod working.

1. **Schema (migration 045).** ✅ *Applied in prod.* `supabase-migrations/045_shifts_redesign.sql` — new tables/columns + idempotent backfill. No drops; old columns still read by current code.
2. **Configure → Shift Types registry.** ✅ *Built and live (046 applied).* `app/api/admin/shift-types/{route,[id]/route}.ts` + `app/admin/ShiftTypesManager.tsx`, wired into Configure → Structure. Requirement-free: name + icon. (Replaced the earlier Event Types registry, now deleted.)
3. **Program tab (admin schedule).** ✅ *Built, tsc-clean, non-breaking.* `ScheduleManager.tsx` editor: **Participation** (general/shift/mandatory) + a **Shift type** picker + capacity (shift) / acknowledgement (mandatory); rows show a participation badge. Admin write path (`app/api/admin/schedule/{route,[id]/route}.ts`) derives legacy `contribution_type`/`event_type`/`capacity` from participation+shift-type via `lib/event-type-compat.ts`, so the live member schedule keeps working. Shift rows carry a compact **roster** (added 2026-07-02): count vs capacity, "✦ no lead yet" hint, and per-holder chips that promote/demote leads (`GET /api/admin/schedule/rosters` + the member page's `set_shift_role` PATCH; legacy-only holds inert).
4. **Group/role requirement config.** ✅ *Built, tsc-clean (046 columns live — works now).* Group modal (`GroupsManager`) + role modal (`DepartmentsManager`) gain an optional **Shift requirement** (shift type + required hours); groups/roles APIs carry the columns.
   - *Attunement authoring* (✅ built separately): a `shift` attunement task can target a specific shift type + hours (the universal requirement).
5. **Attunement hours evaluation.** ✅ *Built (047 applied); queries runtime-verified.* Shifts carry structured `start_time`/`end_time` (047; editor shows Start/End + live duration; display `time` derived). *(Extended later by 054: every schedule event — not just shifts — carries structured times; the editor's free-text Time field is gone and a start time is required on all events. Hours math still only reads shift rows.)* `lib/shift-hours.ts` computes durations; `lib/shift-attunement.ts` `getMemberShiftState` sums held hours per shift type (at the time: many-to-many ∪ legacy single — the union collapsed to `member_shift_signups` alone in item 7) and derives owed requirements from groups/roles (max hours on same-type overlap; role only when approved). `buildAttunementChecklist`: typed shift tasks show `label — X/Yh`; untyped ("Any shift") keep the legacy boolean; derived group/role lines appended, gated on signup-open. Both home + profile wired.
6. **Member `/participate`.** ✅ *Built; full `next build` passes.* New `/api/shift-signups` (GET slots grouped w/ owed hours + POST sign-up + DELETE cancel; capacity + signup-open enforced; counts unioned many-to-many ∪ legacy and cancelling cleared the legacy column too so hours never double-counted — both retired by item 7; admin notified on signup). `SignupSection.tsx`: `CALENDAR_DAYS` grid **retired** — picker groups slots by shift type, owed types first with `X/Yh` progress, one-click sign-up/cancel, multiple holds; "Your Shifts" card lists all held. Role picker decoupled from shifts. `PersonalSchedule` = mandatory events + held shifts (legacy `contribution_type`/`all_hands` reads gone). `CommitmentsSection` shows all held shifts w/ real dates (hardcoded `DAY_LABELS` removed). Admin: member page card lists all shifts w/ per-shift remove (`remove_shift` in the signups PATCH; `clear_shift` clears all), roster "has shift" unioned both tables (single-table since item 7). New member signups write **only** `member_shift_signups`.
7. **Cleanup migration.** ✅ *Done 2026-07-08 (`065_shifts_legacy_drop.sql`).* Dropped dead `shifts` table, `camp_signups.shift_id` + `schedule_event_id`, `/api/admin/shifts`, 045's `event_types`/`event_type_id`, the legacy `contribution_type`/`event_type`/`all_hands`/`event_category` columns, `lib/event-type-compat.ts`, and the shift remnants of `/api/signup` (now role-only). Every "∪ legacy" read union collapsed to `member_shift_signups` alone. The code runs fine against a pre-`065` database (it merely stops reading the columns), so deploy code first, then apply `065`.

---

## Design principles to hold

- **Keep the UX intuitive, not overcomplicated** — every "several sub-items" idea uses the *same* one-expandable-line shape.
- **Not a What-If-specific implementation** — category names, mandatory flags, and requirements are all **data**; nothing hardcodes Setup/Teardown/Decor/Volunteer or the camp dates. (See generalizability log.)
- **One source of truth** — requirements live on the shift type's binding; attunement is a view over them.

---

## Addendum — built beyond the numbered plan (2026-07-01)

All verified live in the browser (signup→progress→cancel round-trip on a real account):

- **Colours** (`lib/shift-colors.ts`): mandatory = the old all-hands teal; each shift type gets a distinct palette hue by registry position (Decor orange, Setup lake blue, Teardown moss, Service magenta). Shared by the main schedule, personal schedule, and picker. Per-type configurable colour = future hook.
- **Member picker is a calendar** (Chanté prefers picking by day): day columns derived from the shifts' real dates, cards coloured by type, owed-hours chips above, type legend below; one row on desktop (no scroll/wrap), stacked day sections on mobile; panel breaks out wider than the `/participate` text column on desktop. Native `confirm()` replaced with a styled `ShiftConfirmModal` (used by picker cards and the Your Shifts card).
- **Schedule editor rework**: Day dropdown removed — `day` **derives from `event_date`** (server-side too, `weekdayFromISO`); non-recurring events require a date; admin list sorts by real date with `WED · JUL 22` rows (day-of-week sorting used to hide wrong-week mistakes). Icon selection = `AssetImagePicker` (Groups-style asset library + upload), replacing the glyph strip.
- **Display calendars date-true**: both `ScheduleCalendarClient` and `PersonalScheduleCalendar` dropped their hardcoded (and mutually inconsistent) July day lists; columns come from `lib/schedule-days.ts` = the **configured event range ∪ real event dates**, events placed by `event_date` (weekday-name fallback for undated legacy rows).
- **Event Dates config**: Admin → Configure → Structure → **Event Dates** (`EventDatesManager`; `page_content.config_event_start_date`/`config_event_end_date`) — the event's overall range, driving the calendars' day columns. Set in prod: 2026-07-22 → 2026-07-27.
- **Admin multi-shift views**: `/admin/[id]` lists every held shift with per-shift Remove (`remove_shift` in the signups PATCH); roster "has shift" reads `member_shift_signups` alone since `065` (boolean — hours-satisfaction display is future polish).

**Remaining:** member-side acknowledgement flow for `requires_ack` mandatory events (toggle exists; gate not yet surfaced to members). *(The final cleanup migration — item 7 — landed 2026-07-08 as `065`.)*

## Decision (2026-07-02): required vs. chosen — two tiers, one checklist

Confirmed with Chanté and **built** (feat/commitment-tiers): the attunement
checklist distinguishes **required** items (authored attunement tasks — the
community-wide minimum; the only tier that gates "Attuned") from **commitment**
items (shift-hours obligations derived from groups/roles the member chose to
join — shown under "Your Commitments" as a guide, never a blocker). Members who
exceed the minimum are celebrated ("Xh is the expectation — you've pledged Yh
more"), and group rows on Participate disclose their commitment before joining
("carries a 3h Setup shift commitment"). The redesign's hours model must keep
this distinction: authored/universal hours = minimum; binding-derived hours =
chosen load.
