# Database Schema

All tables live in a Supabase (Postgres) project. The base schema is in `supabase-schema.sql`; migrations in `supabase-migrations/` document incremental changes (latest here: `073`; all of `025`–`073` **applied in prod** — `072`–`073`, the security-review pair, applied 2026-08-27 right after their deploy; `025`–`070` as of 2026-07-09, `071` (group welcome notes, both parts) applied 2026-07-11 — `059` is the reserved/generated Clerk remap, applied at cutover; `065`, the destructive shifts-legacy drop, applied 2026-07-09 after its code deploy). Confirm `025` (column renames), `029` (the `application-files` bucket), `033` (group messaging), `034`/`035` (group icon images + `group-badges` bucket, `badge_image` → `icon_image`), `036`–`038` (public profile fields, members/profiles, member distinctions), `039`–`041` (lead-up gatherings + notify/image), `042`–`044` (group collections + per-collection profile visibility + per-collection self-join), `045`–`047` (shifts redesign + shift times), and `048`/`049` (participation leads + per-event lead opt-in; the gathering halves are dropped by `050`) are applied before relying on those features.

---

## Tables

> **Tenancy (migration `074`, branch 1a of [tenancy-design.md](tenancy-design.md)):** every table below except `push_tokens` and `notification_preferences` carries `community_id UUID NOT NULL REFERENCES communities(id)` (indexed `<table>_community_idx`). It is not repeated in each table's column list. Until migration `075` lands (end of the code sweep) the column has a **transitional default** `platform_default_community_id()` (= the `glaum` row) so un-swept inserts keep working, and the per-person unique constraints (`members.clerk_user_id`, `camp_signups.clerk_user_id`, `page_content.key` PK, `attunement_nudges` PK, `event_reminders_sent` unique, `conversations.direct_key`, `shift_types.backfill_key`) are still global. Code reaches scoped tables through `tenantDb(community.id)` (`lib/tenant-db.ts`).

### `communities`

The tenant row (`074`). One per community; Glåüm is seeded as `slug = 'glaum'`. Read through `lib/community.ts` (`getCommunity()` resolves the request host against `hosts`; cached, tag `communities`, 5-min revalidate) — never queried from feature code.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `slug` | TEXT UNIQUE | URL-safe identifier, immutable (`glaum`) |
| `name` | TEXT | Display name (`Glåüm`) |
| `description` | TEXT | Meta description |
| `hosts` | TEXT[] | Request hosts that resolve to this community (`{camp.glaum.ca}`); GIN index. Matched with port first, then bare hostname. Unknown host → `DEFAULT_COMMUNITY_SLUG` env (default `glaum`) |
| `timezone` | TEXT | IANA name (`America/Vancouver`); crons + "today" (branch 1d) |
| `event_name` | TEXT | Interim until Event is a first-class object (`What If 2026`) |
| `email_from` | TEXT | `Name <addr>`; NULL → deployment `RESEND_FROM` (branch 1b moves sending here) |
| `theme` | JSONB | Colour/font tokens (branch 1f); `{}` |
| `settings` | JSONB | Small platform-level knobs; `{}` |
| `status` | TEXT | `active` / `paused` / `archived` |
| `created_at` | TIMESTAMPTZ | |


### `applications`

One row per person who has submitted a camp application.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `submitted_at` | TIMESTAMPTZ | Defaults to NOW() |
| `first_name` | TEXT NOT NULL | Max 50 chars (enforced in form) |
| `last_name` | TEXT NOT NULL | Max 50 chars |
| `preferred_name` | TEXT | |
| `pronouns` | TEXT | |
| `email` | TEXT NOT NULL | |
| `phone` | TEXT NOT NULL | |
| `instagram` | TEXT | |
| `location` | TEXT | |
| `camped_before` | TEXT | |
| `attendance` | TEXT | How they plan to participate |
| `arrival_date` | TEXT | |
| `departure_date` | TEXT | |
| `membership_type` | TEXT | Camping on site / staying nearby / visiting socially / etc. Renamed from `camp_relationship` in migration `025`. Options configurable via `page_content` key `member_membership_types`. |
| `vehicle` | TEXT | |
| `space_requirements` | TEXT | |
| `structures` | TEXT | |
| `rideshare` | TEXT | |
| `contributions` | TEXT[] | **Legacy** — superseded by `setup_preference` |
| `setup_preference` | TEXT[] | **Legacy / frozen** as of migration `030` — superseded by the `groups`/`group_members` tables. No longer written or read by the app (historical values remain for backfill). |
| `setup_limitations` | TEXT | |
| `setup_notes` | TEXT | |
| `energizing_participation` | TEXT | |
| `support_needs` | TEXT | |
| `accessibility` | TEXT | |
| `capacity` | TEXT | |
| `participation_style` | TEXT | |
| `community_acceptance` | TEXT | "Yes / Not Yet / It's Complicated". Renamed from `glaum_acceptance` in migration `025`. Label configurable via form-config. |
| `onboarding_status` | TEXT[] | Self-reported onboarding/attunement status. Renamed from `attunement_status` in migration `025`. |
| `onboarding_status_other` | TEXT | Free-text when `onboarding_status = 'Other'`. Renamed from `attunement_status_other` in migration `025`. |
| `draws_to_community` | TEXT | What drew them to this community. Renamed from `draws_to_glaum` in migration `025`. |
| `healthy_community` | TEXT | |
| `acknowledgements` | TEXT[] | The agreement items they checked. Items are configurable via `page_content` key `member_acknowledgements`. |
| `shrimp_relationship` | TEXT | Glåüm-specific fun question — will move to `custom_answers` in a future migration. |
| `avatar_url` | TEXT | Supabase Storage URL |
| `custom_answers` | JSONB | Answers to admin-added custom fields/sections. Added in migration `023`. |
| `status` | TEXT | `pending` / `approved` / `rejected` / `cancelled` |
| `clerk_user_id` | TEXT | Set after Clerk account created |
| `admin_notes` | TEXT | Internal only |
| `reviewed_at` | TIMESTAMPTZ | |
| `reviewed_by` | TEXT | |
| `cancel_reason` | TEXT | |
| `cancelled_at` | TIMESTAMPTZ | |
| `profile_updated_at` | TIMESTAMPTZ | |

**Status flow:** `pending` → `approved` or `rejected`. Approved members can `cancel` (→ `cancelled`).

---

### `members`

Also (`074`, unread until branch 1d): `role` TEXT NOT NULL DEFAULT `'member'` (`member` / `admin` — community-scoped admin, replacing Clerk `publicMetadata.role`) and `can_manage_polls` BOOL NOT NULL DEFAULT false (replacing `publicMetadata.canManagePolls`). Backfilled from Clerk by script in 1d.

Canonical identity — **one row per person** (migration `037`, Phase 1 of profile-as-source-of-truth; see [profile-architecture.md](profile-architecture.md)). Splits the two roles `applications` played: `applications` stays the submission/review artifact, `members` becomes the canonical identity + membership record the app reads. Backfilled one member per distinct person (by `clerk_user_id`, else `lower(email)`) from the most recent application; additive & idempotent. Reads resolve via `lib/members.ts` (`resolveMember`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_user_id` | TEXT UNIQUE | Stable join key once the account exists; **nullable** until first sign-in (multiple NULLs allowed). |
| `email` | TEXT | Indexed on `lower(email)`. |
| `first_name` / `last_name` / `preferred_name` / `pronouns` / `phone` / `avatar_url` | TEXT | Locked core identity columns (real columns, not in the JSONB bag) — queried for display everywhere. |
| `status` | TEXT | `pending` \| `approved` \| `rejected` \| `cancelled`. The canonical membership gate (mirrors `applications.status`). Default `pending`. |
| `application_id` | UUID FK | → `applications(id)`, `ON DELETE SET NULL`. Originating application (nullable). |
| `suspended_at` | TIMESTAMPTZ | Migration `063`. Non-NULL = **suspended**: the member paused their attendance (or an admin did). Orthogonal to `status` — a suspended member is still `approved` and keeps full read access, but is released from **all** commitments (role, groups, shifts, resource claims) and can't take new ones until it's lifted. Excluded from participation counts (Overview) + attunement nudges. See `lib/suspension.ts`. |
| `suspended_by` | TEXT | `clerk_user_id` of who suspended — the member's own id for self-suspension, an admin's otherwise. NULL when not suspended. Migration `063`. |
| `suspension_note` | TEXT | Optional note left at suspension time (shown on `/admin/[id]`). NULL when not suspended. Migration `063`. |
| `dues_paid_at` | TIMESTAMPTZ | Migration `067`. Non-NULL = **camp dues recorded paid**. Collected manually (by email / e-transfer) this year; an admin marks it via Community → Camp Dues or `/admin/[id]`. Drives the `dues` attunement requirement. A future Stripe webhook would set the same column. |
| `dues_paid_by` | TEXT | `clerk_user_id` of the admin who marked dues paid. NULL when unpaid. Migration `067`. |
| `dues_note` | TEXT | Optional free-text note captured at mark-paid time (amount / method, e.g. "$50 e-transfer"). NULL when unpaid. Migration `067`. |
| `dues_reported_at` | TIMESTAMPTZ | Migration `068`. Member **self-reported** paying (e-transfer), pending admin confirmation → "awaiting review". Set via `/api/dues/report`; counts as done for the member's attunement checklist (shown "awaiting confirmation") so a paid member isn't nudged. Superseded by `dues_paid_at` on confirm; cleared when an admin resets to unpaid ("Undo" / "Not received"). |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

---

### `member_profiles`

Configurable profile values, **1:1 with `members`** (migration `037`). Keyed by registry field key (`page_content.config_profile_fields`), e.g. `{"eventExperience":["2024"]}`. Seeded from each member's application `custom_answers`; typed built-in columns (`about_you`, `special_skills`, …) stay in `applications` and migrate field-by-field in later phases. Read via `lib/members.ts` (`getMemberProfileValues`).

| Column | Type | Notes |
|---|---|---|
| `member_id` | UUID PK / FK | → `members(id)`, `ON DELETE CASCADE`. |
| `values` | JSONB NOT NULL | Profile values keyed by registry field key. Default `{}`. |
| `updated_at` | TIMESTAMPTZ | |

---

### `member_distinctions`

Manually attributed distinctions — the **exception** to "distinctions are derived, never stored" (migration `038`). Records distinctions an admin grants **by hand** (honorary / one-off awards or overrides). `evaluateDistinctions` **unions** these with rule-derived ones: a distinction is earned if its conditions pass **or** it appears here for the member (a rule with no conditions is "manual only"). Read via `lib/distinction-awards.ts` (`getMemberAwards`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `member_id` | UUID FK | → `members(id)`, `ON DELETE CASCADE`. |
| `distinction_id` | TEXT NOT NULL | Matches `DistinctionRule.id` in `page_content.config_distinctions`. |
| `note` | TEXT | Optional admin note. |
| `granted_by` | TEXT | `clerk_user_id` of the granting admin. |
| `granted_at` | TIMESTAMPTZ | |

**Unique constraint:** `(member_id, distinction_id)` — one grant per distinction per member.

---

### `volunteers`

One row per outside volunteer (non-member who signs up to help). Active volunteers pick shifts self-serve (2026-07-16) — their holds live in `member_shift_signups`, keyed by the same `clerk_user_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `created_at` | TIMESTAMPTZ | ⚠️ NOT `submitted_at` (that's `applications`) — a wrong row here caused the 2026-07-09 volunteer-profile 404 |
| `first_name` | TEXT NOT NULL | Max 50 chars |
| `last_name` | TEXT NOT NULL | Max 50 chars |
| `preferred_name` | TEXT | |
| `pronouns` | TEXT | |
| `email` | TEXT NOT NULL | |
| `phone` | TEXT NOT NULL | |
| `avatar_url` | TEXT | Written by `/api/profile/avatar` for signed-in volunteers; shown on `/members` + the volunteer profile |
| `signup_intent` | TEXT[] | What they want to help with |
| `days_available` / `preferred_times` / `shift_interests` / `role_interests` | TEXT[] | Availability + interest signals from the signup form (surfaced in Admin → Volunteers and the volunteer's own `/profile`) |
| `other_notes` / `specific_interests` / `special_skills` / `brings_to_glaum` / `why_contribute` / `familiar_with_glaum` | TEXT | Free-text signup answers |
| `status` | TEXT | `pending` / `active` / `cancelled` / `removed` |
| `clerk_user_id` | TEXT | |
| `dues_paid_at` / `dues_paid_by` / `dues_note` | TIMESTAMPTZ / TEXT / TEXT | Migration `069`. Camp-dues state when the dues audience includes volunteers (`config_dues`). **Admin-tracked only** — volunteers have no self-serve dues surface, so there's no `dues_reported_at` counterpart. Mirrors the member dues columns (`067`). |

---

### `departments`

Groups of related camp roles.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | Max 40 chars |
| `description` | TEXT | |
| `icon` | TEXT | Emoji **or** image reference (asset-library path like `/asset-library/icons/…` or an uploaded `group-badges` URL). Chosen via the shared `AssetImagePicker` in the Departments admin (`/api/admin/departments/[id]/icon`); rendered as `<img>` vs text by `isImageIcon` (`lib/icon-src.ts`) at every render site |
| `sort_order` | INT | |

---

### `roles`

Individual camp roles within a department.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `department_id` | UUID FK → `departments.id` | |
| `name` | TEXT | Max 28 chars |
| `description` | TEXT | |
| `capacity` | INT | Max number of people for this role |
| `sort_order` | INT | |
| `required_shift_type_id` | UUID FK → `shift_types.id` | Optional **shift requirement**: members holding this role owe hours of this shift type. `ON DELETE SET NULL`. Migration `046` |
| `required_shift_hours` | NUMERIC(4,1) | Hours owed (with the above). Attunement derives + reflects it |

---

### `group_collections`

The configurable container **above** `groups` (migration `042`; `show_on_profile` added in `043`). An organizer names a collection ("Contributions", "Volunteer Teams", "Committees", "Guilds") and defines the selectable child groups beneath it — the platform hardcodes no group semantics. Additive/non-breaking: every existing surface keys off leaf `groups`, and `042` backfills all uncollected groups into a default **"Contributions"** collection (Glåüm seed framing; organizers rename it — see [generalizability-log.md](generalizability-log.md)). Read via `lib/group-collections.ts` (`getGroupCollections`); managed in **Admin → Configure → Structure → Groups** (`GroupsManager.tsx`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | Organizer-named (e.g. "Contributions") |
| `description` | TEXT | |
| `selection` | TEXT | `'multi'` (default — a member may hold several child groups) or `'single'` (exactly one, e.g. cabin / T-shirt size). `CHECK (selection IN ('single','multi'))`. |
| `show_on_profile` | BOOL | Added in `043`, default `true`. Whether members' groups in this collection appear on their profile (own `/profile` + public `/members/[id]`). Governs profile **display only** — distinctions, attunement, schedule filtering and admin rosters still see all membership. **Independent of `self_join`** (migration `044` split these two concerns apart). |
| `self_join` | BOOL | Added in `044`, default `false`. Whether members may self-join/leave this collection's groups on the Participate page (`/participate` → **Your Groups**, `/api/groups/membership`). A single **collection-level** eligibility gate — every group in a self-join collection is self-joinable; the old per-group `apply_selectable` flag is no longer consulted. Orthogonal to `show_on_profile`. `044` backfills `true` for collections that had a self-joinable group under the old model. |
| `sort_order` | INT | |
| `created_at` | TIMESTAMPTZ | |

Groups link up via `groups.collection_id` (FK `ON DELETE SET NULL`); orphaned groups surface in a synthetic "uncollected" bucket in the admin.

---

### `groups`

Configurable groups members belong to (e.g. Setup, Teardown, Decor). Added in migration `030`. **Replaced** the old contribution-types (`setup_preference`) mechanism: members are admin-assigned via Admin → Groups. Applicants can also opt in if an admin adds a **Group selection** field (`type: 'group_select'`) to the member application in the Application Builder. Each such field carries its own configurable list of offered groups in `FieldConfig.options` (group ids; **unset = all groups**, picked via a checklist in the builder). Picks write to `group_choices` → `group_members` (source `'application'`) on submit; `/api/apply` independently re-validates choices against the visible group_select fields' configured ids. Member-facing "contributions" (profile Commitments, attunement task, personal-schedule filtering, members directory) and the admin overview/registry now read group membership via `lib/groups.ts` (`getMemberGroups`, `getGroupNamesByUser`).

**Post-approval self-service:** approved members can join/leave **opt-in groups** after the fact via the **Your Groups** section on `/participate` (Participate), backed by `GET/POST /api/groups/membership`. That endpoint offers a group when its **collection has `self_join` on** (migration `044`; a group with no collection is not self-joinable) — a single collection-level gate, **separate** from the apply form's `group_select` fields (which govern the wizard only), from the collection's `show_on_profile` (profile display only), and from group `visibility` (Find-a-group picker only). **Icon images:** an optional per-group `icon_image` (migration `034`, renamed from `badge_image` in `035`) is the circle icon of the member's **Active Commitments** row on the profile (`CommitmentsSection.tsx` via `groupCommitmentMeta`), and can be reused as **distinction medal art**; admins upload it in the Groups edit modal.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | Shown to applicants when the group is offered by a Group selection field |
| `icon` | TEXT | Emoji |
| `icon_image` | TEXT | Optional public URL of a patch-style icon image (in the `group-badges` bucket — legacy bucket name). Added as `badge_image` in migration `034`, renamed to `icon_image` in `035`. Used as the circle icon of the member's Active Commitments row (`CommitmentsSection.tsx`) and reusable as distinction medal art; admin-uploaded via the Groups edit modal (`POST/DELETE /api/admin/groups/[id]/icon`). |
| `apply_selectable` | BOOL | **Dormant since migration `044`.** Was the per-group member opt-in gate; self-join is now a collection-level flag (`group_collections.self_join`) and this column is no longer read or surfaced in the admin UI. Left in place to avoid a destructive drop. |
| `sort_order` | INT | |
| `join_policy` | TEXT | Governance, added in `033`. `'admin_assigned'` (default — admin manages membership; today's crews) or `'open'` (members self-join/leave). (`'request'` is reserved for when leads exist.) Set in GroupsManager; `open` enables self-join via **Messages → Find a group** (`/api/groups/[id]/join` · `/leave`). |
| `visibility` | TEXT | Added in `033`. `'listed'` (default — open groups appear in the Find-a-group picker) or `'hidden'` (invite/admin-add only, not discoverable). Set in GroupsManager. Note: this gates the **Messages → Find a group** picker only; it does **not** affect Participate self-join (that's the collection's `self_join`). |
| `collection_id` | UUID FK | → `group_collections(id)`, `ON DELETE SET NULL` (migration `042`). The parent collection; pre-`042` groups were backfilled into the default "Contributions" collection. |
| `required_shift_type_id` | UUID FK → `shift_types.id` | Optional **shift requirement**: group members owe hours of this shift type (e.g. Teardown crew → 3h of Teardown). Set in the group edit modal. `ON DELETE SET NULL`. Migration `046` |
| `required_shift_hours` | NUMERIC(4,1) | Hours owed (with the above). Attunement derives + reflects it as an `X/Yh` line |
| `created_at` | TIMESTAMPTZ | |

Each group also gets a message **thread** — one `conversations` row (`type='group'`, `group_id` set), created on group creation (`POST /api/admin/groups`) and backfilled for existing groups by migration `033`. See [group-messaging.md](group-messaging.md) and the Group Threads feature.

Managed via Admin → **Groups** (`GroupsManager.tsx`). API: `/api/admin/groups` (GET/POST), `/api/admin/groups/[id]` (PATCH/DELETE).

---

### `group_members`

One row per member assigned to a group. Added in migration `030`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `group_id` | UUID FK → `groups.id` ON DELETE CASCADE | |
| `clerk_user_id` | TEXT NOT NULL | Member identity (join to `applications` in JS, no FK) |
| `source` | TEXT | How they joined: `'admin'` (assigned) or `'application'` (opted in on apply form). Default `'admin'` |
| `role` | TEXT | `'member'` (default) or `'lead'`. Added in `033` for a future leads feature; **unused in v1** (any member can post). |
| `created_at` | TIMESTAMPTZ | |

**Unique constraint:** `(group_id, clerk_user_id)`. Adds use upsert with `ignoreDuplicates`. Roster API: `/api/admin/groups/[id]/members` (GET roster enriched from `applications`, POST add, DELETE remove via `?clerk_user_id=`). Application opt-ins are inserted in `/api/apply`, validated against the offered group ids of the visible `group_select` fields in the saved member-form config.

This table is the **source of truth for group thread access** — group messaging derives "which groups can I see/post in" directly from `group_members`, so adding/removing a member here immediately changes their inbox with no extra wiring.

---

### `schedule_events`

Public camp schedule entries. **Reworked by the shifts redesign** (see [shifts-redesign.md](shifts-redesign.md)): every event now carries a `participation_type`, and shift-behaved events belong to a `shift_types` row and carry structured start/end times.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `day` | TEXT | Weekday label (e.g. `"Thursday"`) — **derived from `event_date`** on save (admin API), never set by hand |
| `time` | TEXT | Display time string, **derived** from `start_time`/`end_time` (`formatShiftRange`) on every save — never typed by hand (free-text time entry removed with `054`) |
| `title` | TEXT | |
| `subtitle` | TEXT | |
| `detail_desc` | TEXT | Expanded description |
| `icon_type` | TEXT | Icon identifier: a built-in glyph name (legacy) or an image URL from the asset library / upload (`AssetImagePicker`) |
| `visible` | BOOL | Whether shown on public schedule |
| `highlight` | BOOL | Whether visually highlighted |
| `is_recurring` | BOOL | Recurring (no single date) |
| `recurrence_days` | TEXT[] | Recurring only: NULL = repeats every day of the event range; an array of ISO dates = repeats on just those days (057) |
| `show_on_schedule` | BOOL | Default TRUE. FALSE = skips the schedule page + home teaser, but stays signable/ackable (unlike `visible`, which hides everywhere) (058) |
| `sort_order` | INT | |
| `event_date` | DATE | The event's real calendar date. **Required for non-recurring events** (editor enforces); drives calendar day columns, admin list ordering, and Upcoming Gatherings filtering |
| `participation_type` | TEXT | `'general'` (optional/info) / `'shift'` (signable slots) / `'mandatory'` (everyone attends). Migration `046` |
| `shift_type_id` | UUID FK → `shift_types.id` | Which kind of shift this slot is (shift events only). `ON DELETE SET NULL`. Migration `046` |
| `requires_ack` | BOOL | Mandatory events only: whether members must acknowledge ("I'll be there"). Per-event toggle; ack flow not yet built member-side. Migration `045` |
| `start_time` / `end_time` | TEXT | `"HH:MM"` 24-hour, **on every event** (was shift-only until `054`; backfilled from the old free-text `time` by `054`). Editor requires a start on all events, an end on shifts. Duration = `shiftDurationHours` (`lib/shift-hours.ts`) — what counts toward hours requirements. Migrations `047` + `054` |
| `needs_lead` | BOOL | Whether this shift has a lead role (organizer's call at creation; shift events only). Gates all member lead affordances; the offer appears in the signup confirm. Migration `049` |
| `capacity` | INT | Shift events only: max signups per slot. NULL = unlimited |

*(The legacy `event_type` / `contribution_type` / `all_hands` / `event_category` columns and `045`'s dormant `event_type_id` were dropped by migration `065`.)*

Colours key off `participation_type` + the shift type's palette slot — see [design-system.md → Event Type Colors](design-system.md#event-type-colors).

---

### `shift_types`

The configurable registry of shift **kinds** (Setup, Teardown, Decor, Service, …). Migration `046`. Deliberately **requirement-free**: a type on its own is just *available* (e.g. an optional Tea shift). Requirements are authored on whoever owes them — a group/role (`required_shift_type_id` + `required_shift_hours`) or an attunement `shift` task (everyone). Managed in Admin → Configure → Structure → **Shift Types** (`ShiftTypesManager.tsx`); API `/api/admin/shift-types`. Each type's registry position (sort order) doubles as its colour palette slot (`lib/shift-colors.ts`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | e.g. "Service" |
| `icon` | TEXT | Emoji |
| `sort_order` | INT | Also the colour palette index |
| `backfill_key` | TEXT UNIQUE | Provenance of migration-seeded rows; NULL for admin-created |

---

### `member_shift_signups`

Many-to-many shift holds — a member **or active volunteer** (2026-07-16; same `clerk_user_id` key, no schema change) can sign up for **any number** of shift occurrences. **The single source of shift holds** (the legacy single `camp_signups.schedule_event_id` was dropped by `065`). Written by the `/api/shift-signups` API (POST/DELETE; gated on `getShiftParticipant`) and the admin `remove_shift`/`clear_shift`/`set_shift_role` actions; also **deleted** by `PATCH /api/admin/schedule/[id]` when a recurring event's `recurrence_days` is trimmed (rows whose `occurrence_date` falls outside the saved subset — the removed night's signups go with the night; the admin UI confirms the count first, 2026-07-16), **moved** by the same route's `split_night` action (save-for-just-one-night carves the night into its own one-off event; its signups follow — `schedule_event_id` → the new row, `occurrence_date` → NULL), and deleted by the event-delete CASCADE (the delete confirm counts the signups at stake). A member's held hours per shift type (summed `shiftDurationHours` of their held occurrences, `lib/shift-attunement.ts`) are what satisfy hour requirements.

**Per-night model (migration `064`):** recurrence is only an admin authoring convenience — each night of a recurring shift is a regular shift in its own right, signed independently, with its own capacity, roster, hours and lead. A signup names its night via `occurrence_date`. The concrete nights of an event come from `lib/shift-occurrences.ts` (`recurrence_days`, or every day of the configured event range for an "every day" shift).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_user_id` | TEXT NOT NULL | Join key (matches `group_members` / `camp_signups`) |
| `schedule_event_id` | UUID FK → `schedule_events.id` ON DELETE CASCADE | |
| `occurrence_date` | DATE | **The night held.** `NULL` = the single occurrence of a non-recurring shift; a date = one night of a recurring event (validated against its occurrences by the API). Migration `064` |
| `role` | TEXT NOT NULL | `'member'` (default) / `'lead'` — offered to lead this shift. Lives on the signup row (dies with it; co-leads allowed; display-only). Scoped to the occurrence. Migration `048` |
| `created_at` | TIMESTAMPTZ | |

Uniqueness is two **partial** unique indexes (a plain `UNIQUE` treats NULLs as distinct): `(clerk_user_id, schedule_event_id) WHERE occurrence_date IS NULL` and `(clerk_user_id, schedule_event_id, occurrence_date) WHERE occurrence_date IS NOT NULL` — one hold per non-recurring shift, one per night. Migration `064` (replaced the old whole-event `UNIQUE`).

---

### `camp_signups`

One row per approved camper's **role** assignment (shifts live in `member_shift_signups`; the legacy `schedule_event_id`/`shift_id` columns were dropped by `065`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_user_id` | TEXT | |
| `role_id` | UUID FK → `roles.id` | |
| `role_approval_status` | TEXT | Approval state for the specific role claim |

> **Note:** There is no Supabase FK between `camp_signups` and `applications`. Always fetch both tables separately and join in JS.

---

### `admin_notifications`

Bell notifications shown to admins.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `application_id` | UUID FK → `applications.id` ON DELETE CASCADE | Optional link to an application |
| `event_type` | TEXT | Category of notification |
| `message` | TEXT | Display text |
| `details` | JSONB | Extra structured data |
| `created_at` | TIMESTAMPTZ | |
| `read_at` | TIMESTAMPTZ | NULL = unread |

---

### `user_notifications`

Bell notifications shown to individual members.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_user_id` | TEXT | Recipient |
| `event_type` | TEXT | e.g. `application_approved`/`_rejected`, `role_suggestion_*`, `role_request_*`, `volunteer_approved`, `new_message`, `group_mention`, `lead_up_gathering` (deep-links to `/schedule`). `UserNotificationBell` maps each to a deep link. |
| `message` | TEXT | |
| `details` | JSONB | Event payload, e.g. `{ senderId }` for `new_message`, `{ groupId, messageId }` for `group_mention` |
| `created_at` | TIMESTAMPTZ | |
| `read_at` | TIMESTAMPTZ | NULL = unread |

---

### `announcements`

Admin-posted updates shown to all approved members on the dashboard.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | TEXT NOT NULL | |
| `body` | TEXT | Optional detail text |
| `pinned` | BOOL | Pinned items sort first. Default `false` |
| `visible` | BOOL | Whether shown to members. Default `true` |
| `expires_at` | TIMESTAMPTZ | Auto-hides after this date. NULL = show indefinitely |
| `created_at` | TIMESTAMPTZ | |

---

### `radio_events`

The stored half of **Radio** — the curated community feed (migration `061`; spec [radio.md](radio.md)). One row per *moment* — Radio is editorial, **not an audit log** ("would the average member care?"). Written by `postRadioEvent` / `postSourcedRadioEvent` (`lib/radio.ts`, which also holds all the copy builders) from the route where the moment happens (application approve → welcome, resource claim/offer → contribution, list completion → milestone, manual distinction grant → achievement, organizer composer → broadcast, member composer → voice). The Now / Up next strip on `/radio` is **derived at read time** and never stored here.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `kind` | TEXT NOT NULL | `'broadcast'` / `'welcome'` / `'contribution'` / `'achievement'` / `'milestone'` / `'voice'` — open set, no CHECK (new kinds need no migration) |
| `message` | TEXT NOT NULL | The headline, actor name inline ("Welcome Sarah to Glåüm!") |
| `detail` | TEXT | Optional supporting line ("Only one more to go!" / a medal's engraving) |
| `icon` | TEXT | Emoji or asset-library image path |
| `actor_clerk_id` | TEXT | Member the moment is about; their **current** avatar is joined at read time (shoutouts pattern) |
| `actor_name` | TEXT | Display name denormalized at write time — the feed is a historical record |
| `link` | TEXT | Optional internal deep link (e.g. `/participate#bring`) |
| `created_by` | TEXT | Admin clerk_user_id, organizer broadcasts only |
| `visible` | BOOL | Default `true` (admin delete removes the row outright; the column is future curation headroom) |
| `created_at` | TIMESTAMPTZ | Feed order (indexed DESC) |

Migration `061` also **backfills** one `welcome` post per approved application from `reviewed_at`, so the feed launches populated. Automatic sources are toggleable via `page_content.config_radio`.

---

### `page_content`

Admin-editable copy for the homepage. One row per key.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | e.g. `home_tagline`, `home_quote`, `home_about_heading` |
| `value` | TEXT | The content |
| `updated_at` | TIMESTAMPTZ | |

**Known keys:**
- `home_tagline` — hero tagline (shown on public page + logged-in dashboard). Editable inline in page edit mode.
- `home_quote` — quote card text in logged-in hero banner
- `home_about_heading` / `home_about_body` — About section (public page)
- `home_participate_heading` / `home_participate_body` — Participate section (public page)
- `config_member_form` — JSON blob (`MemberFormConfig`) for the camp member application. Set by Application Builder. `mergeMemberConfig` (in `lib/form-config.ts`) reconciles it with defaults on every load: preserves the saved order of **all** sections (built-in + custom, so a custom section can be first), merges built-in field overrides, keeps custom fields/elements as-is, and re-injects only missing *locked* core fields. Field option lists and **agreement clauses** now live in each field's `options` here (editable in the builder).
- `config_volunteer_form` — JSON blob (`VolunteerFormConfig`) for the volunteer signup. Same pattern (flat field list, no custom sections).
- `config_track_picker` — JSON `{ memberTitle, memberDesc, volunteerTitle, volunteerDesc }` for the `/apply` TrackPicker cards. Edited in the Application Builder (Member/Volunteer tabs). Falls back to `DEFAULT_TRACK_COPY` in `lib/site-config.ts`.
- `dashboard_layout` — JSON blob controlling the member dashboard widget layout. Shape: `{ order: string[], hidden: string[], widths: Record<string, 'half' | 'full'> }`. Managed by the inline page editor. Widget IDs: `announcements`, `shoutouts`, `polls`, `events`, `spotlight`, `activity`.
- `member_acknowledgements` — JSON array of strings. **Legacy** source for the Many Hands Agreement clauses — now superseded by the `acknowledgements` field's `options` in `config_member_form` (the Agreement field type, edited in the builder). Still read as a fallback when that field has no options. Falls back to `DEFAULT_AGREEMENT_ITEMS` in `lib/site-config.ts`.
- `catering_kitchen_state` / `catering_kitchen_state_test` — **Retired 2026-08-26, rows deleted 2026-08-27** (kitchen board extracted to the All Hands repo; state copied to the All Hands Supabase at cutover, then both rows dropped here once camp `/kitchen.html` + `/api/kitchen-list` were verified 404). These keys no longer exist in this database.
- `member_attendance_options` — JSON array of strings. Radio options for the attendance question in the application form. Falls back to `DEFAULT_ATTENDANCE_OPTIONS` in `lib/site-config.ts`.
- `member_membership_types` — JSON array of strings. Options for the membership type dropdown in profile settings. Falls back to `MEMBERSHIP_TYPE_OPTIONS` in `lib/application-options.ts`.
- `community_contribution_types` — **Retired** in migration `030` (Groups replaced contribution types). No longer read; the Application Builder "Contribution Types" tab and the `setup_preference` application field were removed. Any existing row is orphaned/harmless. `parseContributionTypes`/`DEFAULT_CONTRIBUTION_TYPES` remain in `lib/application-options.ts` only as the `ContributionType` shape (`{ value, icon, description }`) reused for group commitment metadata.
- `config_attunement_tasks` — JSON array of `AttunementTask` objects (`{ id, label, requirement, enabled, collectionId?, requiredCount?, shiftTypeId?, requiredHours? }`) driving the profile **Attunement Status** checklist. `requirement` is one of `role | shift | collection | photo | approved` and auto-completes the item (logic in `buildAttunementChecklist`, `lib/attunement.ts`). A `shift` task with a `shiftTypeId` + `requiredHours` is the **universal** hours requirement ("everyone owes 3h of Service"), completed when the member's held hours of that type reach the target; without a `shiftTypeId` it's the legacy "holds any shift" boolean. Group/role-conditional requirements are **not** authored here — they live on the group/role and appear as derived checklist lines. Managed via Admin → Configure → Attunement Tasks (`AttunementTasksManager.tsx`). Falls back to `DEFAULT_ATTUNEMENT_TASKS` in `lib/site-config.ts`.
- `config_shift_signup_open` — string `'true'`/`'false'` (defaults open when absent). When `'false'`, the `/participate` shift calendar is hidden behind a "times not confirmed" notice, `/api/shift-signups` POST rejects new signups (cancelling stays allowed), and shift-requirement attunement lines (authored + derived) are hidden from the checklist. Toggled via Admin → Program → Schedule (`ShiftSignupToggle.tsx`).
- `config_event_start_date` / `config_event_end_date` — `"YYYY-MM-DD"` strings: the event's overall date range. The schedule calendars (`ScheduleSection` → `ScheduleCalendarClient`) show a day column for every date in this range (∪ any real event dates outside it — `lib/schedule-days.ts`). Managed via Admin → Configure → Structure → **Event Dates** (`EventDatesManager.tsx`). The start date also drives the home-banner countdown and the nudge emails' "gathers in N days" line (`lib/camp-event.ts` `daysUntilEvent`).
- `config_attunement_nudge_days` — string integer: days between attunement nudge emails per member (`'0'` = off; absent/invalid → default `2`). Parsed by `parseAttunementNudgeDays` (`lib/site-config.ts`); consumed by `/api/cron/attunement-nudges`; set via the **Reminder emails** cadence select in the Attunement Tasks manager (Admin → Configure).
- `config_radio` — JSON `{ sources: { welcome, contribution, achievement, milestone, voice } }`: which automatic Radio sources post (absent key / malformed = all **on**). Parsed by `parseRadioSources` (`lib/radio.ts`); toggled in Admin → Program → Radio (`RadioManager.tsx`). Organizer broadcasts have no toggle. See [radio.md](radio.md).
- `config_dues` — JSON `{ enabled, audience: { members, volunteers }, paymentEmail, mode: 'fixed'|'sliding', amount, minAmount, maxAmount, instructions }`: camp-dues settings + member-facing payment info shown on `/dues`. `enabled` = master on/off (**default false** — dues start off and are turned on by hand; `parseDuesConfig` treats a missing/legacy `enabled` as off); `audience` = who owes dues (default members only — camp members get the full self-report/attunement flow, volunteers are admin-tracked only). Amounts are **free text** (no currency assumption). Parsed by `parseDuesConfig` (`lib/dues.ts`); edited in Admin → Community → Camp Dues (`DuesManager.tsx`). Per-person paid state lives on `members`/`volunteers`, not here. Migrations `067`–`069`.
- `config_distinctions` — JSON array of `DistinctionRule` objects (`{ id, label, description?, image?, glyph?, engraving?, yearFact?, conditions[], enabled }`) driving the profile **Cabinet of Distinctions**. `image` is an asset-library path or uploaded URL; `engraving` is an optional short static caption (≤32 chars) shown under the medal. Each rule's `conditions` (`{ fact, op, value }`, all must pass) are evaluated against derived member facts — **earned medals are never stored** (see [features.md](features.md#distinctions)). Managed via Admin → Distinctions (`DistinctionsManager.tsx`). Parsed/evaluated by `lib/distinctions.ts` (`parseDistinctions`/`evaluateDistinctions`); facts come from `lib/member-facts.ts` (`buildMemberFacts`). Falls back to `DEFAULT_DISTINCTIONS`.

- `config_profile_fields` — JSON array of `ProfileField` objects (`{ key, label, type, options?, default?, public, memberEditable, applicationEligible, distinctionEligible, askExisting?, required?, system?, enabled }`) — the **Profile Field registry** defining each member profile detail field (bio, quote, + admin-added). Managed via Admin → Configure → **Profile Fields** (`ProfileFieldsManager.tsx`); parsed by `parseProfileFields` in `lib/profile-fields.ts`, falling back to `DEFAULT_PROFILE_FIELDS`. `public` = **Visible** on the member profile (off = admin-only, shown on `/admin/[id]`); `key` is the stable identity that member answers are stored under in `member_profiles.values`. See [profile-architecture.md](profile-architecture.md) and [features.md](features.md).

---

### `messages`

Messages in both **direct (1:1)** and **group** threads. Originally 1:1 only (migration `022`); migration `033` attached every message to a `conversation` and added reply support (group messaging — see [group-messaging.md](group-messaging.md)).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `conversation_id` | UUID FK → `conversations.id` ON DELETE CASCADE | The thread this message belongs to. Added in `033`; backfilled for existing DMs. |
| `sender_clerk_id` | TEXT NOT NULL | Sender's Clerk user ID. **`'system'`** (sentinel, `SYSTEM_SENDER` in `lib/conversations.ts`) marks a system-authored note — currently the per-member group welcome (`071`). |
| `recipient_clerk_id` | TEXT | The other party in a **direct** message. **Now nullable** (`033`) — NULL for group messages. Vestigial; kept for legacy DM reads, dropped in a later cleanup. |
| `parent_message_id` | UUID FK → `messages.id` ON DELETE CASCADE | Reply support (`033`). NULL = top-level; set = a reply in that message's thread. **One level only** — replies can't have replies (enforced in the group POST route). Used by group threads. |
| `body` | TEXT NOT NULL | Message content. Max 2,000 chars (DB-enforced CHECK) |
| `sender_name` | TEXT | Snapshot of the sender's display name (`preferred_name`/`first_name`) at send time. Added in migration `032`. Lets a thread keep a readable name after the sender's application is deleted; used as a fallback by the inbox + thread when no profile resolves. |
| `read_at` | TIMESTAMPTZ | **DM-era column.** Per-message read flag for 1:1. Read state is now tracked per-participant on `conversation_participants.last_read_at` (groups can't use a single row-level flag); the DM thread derives `read`/`read_at` from the recipient's `last_read_at`. |
| `created_at` | TIMESTAMPTZ NOT NULL | Defaults to NOW() |
| `visible_to` | TEXT | **Per-member visibility** (`071`). NULL = a normal message every participant sees; set to a clerk id = a **private system note** only that member sees — used for the group **welcome note** ("Welcome to X! ✦ …", inserted on every `group_members` add + backfilled for existing memberships, deleted again on removal so a re-add re-welcomes). Every member-facing message reader filters via `visibleToFilter()` in `lib/conversations.ts` (thread GET, inbox summaries, unread count). |

Indexed on `(conversation_id, created_at)`, plus the original `(recipient_clerk_id, …)` / `(sender_clerk_id, …)` indexes, plus a partial index on `visible_to` (`071`).

**Privacy:** direct messages are private to the two parties; group messages are visible to group members only (and `visible_to` notes to their addressee only). Admins have no special read access. No FK to `applications` — join in JS using `clerk_user_id`.

---

### `conversations`

One row per thread. A **direct** conversation is a 2-participant DM; a **group** conversation is bound to a group. Added in migration `033`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `type` | TEXT NOT NULL | `'direct'` or `'group'` (CHECK) |
| `group_id` | UUID FK → `groups.id` ON DELETE CASCADE | Set iff `type='group'` (one conversation per group — unique partial index). Deleting a group cascades its thread away. |
| `direct_key` | TEXT | Set iff `type='direct'` — the two clerk ids sorted + joined (`"a\|b"`), unique partial index. Maps each unordered DM pair to exactly one conversation (idempotency + resolve-or-create). |
| `created_at` | TIMESTAMPTZ NOT NULL | |

CHECK constraints keep `group_id`/`direct_key` consistent with `type`. Helpers in `lib/conversations.ts` (`getOrCreateDirectConversation`, `findGroupConversation`/`getOrCreateGroupConversation`, `getMyConversations`, `getUnreadCount`).

---

### `conversation_participants`

Per-user state in a conversation. For **direct** conversations both parties get a row (created with the conversation). For **group** conversations these rows are a **lazily-created cache** — group *membership* is derived from `group_members` (the source of truth), and a participant row is created on first read/post to hold the read cursor. Added in migration `033`.

| Column | Type | Notes |
|---|---|---|
| `conversation_id` | UUID FK → `conversations.id` ON DELETE CASCADE | PK part |
| `clerk_user_id` | TEXT NOT NULL | PK part |
| `last_read_at` | TIMESTAMPTZ | Read cursor. A message is unread for me if `created_at > last_read_at` and I'm not the sender. Advanced by the `…/read` routes. |
| `muted` | BOOL | Per-thread mute, toggled from the group thread's overflow menu (`PATCH …/me`). Muted threads don't contribute to the unread badge. Default `false`. |
| `email_opt_in` | BOOL | Opt in to email for **all** activity in this thread (group thread overflow menu). Group threads are quiet by default, so `false`; when on, the post route emails the member, throttled per quiet period. |
| `joined_at` | TIMESTAMPTZ NOT NULL | |

**Primary key:** `(conversation_id, clerk_user_id)`.

---

### `push_tokens`

Push-notification device tokens — one row per device a member has granted notifications on. Registered by the native app (`POST /api/push/register`), consumed by `lib/push.ts` (FCM HTTP v1), pruned automatically when FCM reports a token unregistered. Added in migration `062`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_user_id` | TEXT NOT NULL | indexed |
| `platform` | TEXT NOT NULL | `'ios'` / `'android'` |
| `token` | TEXT NOT NULL UNIQUE | FCM registration token (device-scoped; upsert re-homes a device on account switch) |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `last_seen_at` | TIMESTAMPTZ NOT NULL | refreshed on every re-register |

---

### `shoutouts`

Member-posted shoutouts shown on the home-page member dashboard (the `shoutouts` widget). Added in migration `031`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_user_id` | TEXT NOT NULL | Author identity (join to `applications` in JS for avatar; no FK) |
| `author_name` | TEXT NOT NULL | Display name snapshot at post time (preferred/first name) |
| `body` | TEXT NOT NULL | Post content. 1–250 chars (DB-enforced CHECK) |
| `visible` | BOOL | Reserved for future moderation. Default `true` |
| `created_at` | TIMESTAMPTZ | Defaults to NOW() |

**Who can post:** any approved member (`POST /api/shoutouts`). **Who can delete:** the author or an admin (`DELETE /api/shoutouts/[id]`). The widget (`app/ShoutoutWidget.tsx`) is part of the admin-configurable `dashboard_layout` (widget id `shoutouts`), so it can be reordered/hidden/widened like the others. Avatars are joined in JS from `applications` by `clerk_user_id` at render time (so they stay current).

---

### `role_suggestions`

Member-submitted suggestions for new departments or roles. Added in migration `017`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `clerk_user_id` | TEXT NOT NULL | Submitter |
| `applicant_name` | TEXT | Display name at time of submission |
| `dept_name` | TEXT NOT NULL | Suggested department name |
| `role_name` | TEXT NOT NULL | Suggested role name |
| `notes` | TEXT | Optional context from member |
| `status` | TEXT | `pending` / `approved` / `rejected` |
| `created_at` | TIMESTAMPTZ | |
| `reviewed_at` | TIMESTAMPTZ | |

**Approval flow:**
1. Member submits via `SuggestRoleModal` → `POST /api/role-suggestions` → creates `admin_notifications` entry
2. Admin reviews in "Role Suggestions" section → `PATCH /api/admin/role-suggestions/[id]`
3. Approve: finds or creates department (case-insensitive name match), creates role, sends `user_notifications` to member
4. Reject: sends `user_notifications` to member

---

## Storage Buckets

| Bucket | Used for | Bucket access |
|---|---|---|
| `avatars` | Member profile photos (uploaded via `AvatarUpload`; also the application Photo field → `/api/profile/avatar`). Stored normalized since 2026-08-27: ≤1024px WebP (GIFs as-is), 1-year `cacheControl`; pre-existing originals retro-normalized via one-off `scripts/reencode-avatars.mjs` (dry-run by default, `--execute` to apply; also repoints `avatar_url` in applications/volunteers/members) | Public |
| `schedule-icons` | Custom icons for schedule events | Public (must be configured) |
| `application-files` | Attachments for admin-added **File upload** application fields (`/api/apply/file`) | **Private** since migration `072` (created public by `029`) — reads go through GET `/api/apply/file?path=` (owner-or-admin → 60s signed URL); never rely on object URLs |
| `group-badges` | Icon/badge art for the shared asset library — group icons (`groups/` prefix → `groups.icon_image`), distinction medals (`distinctions/`), and department icons (`departments/`), each via `/api/admin/{groups,distinctions,departments}/[id]/icon`. Legacy bucket name. Objects stay full-frame 1536×1024 PNG (display goes through the transform CDN via `iconDisplaySrc`); pre-2026-08-27 objects re-stamped to 1-year `cacheControl` via one-off `scripts/restamp-group-badges.mjs` (dry-run by default, `--execute` to apply; repoints `groups.icon_image`) | Public — **must be created** (migration `034`, or create in the Supabase dashboard like `avatars`) |

---

## Migrations Reference

| File | What it adds |
|---|---|
| `profile-updates.sql` | **Unnumbered — predates the numbering scheme.** `cancel_reason` / `cancelled_at` / `profile_updated_at` on `applications` (profile edits + self-cancellation) + the `admin_notifications` table & unread index. Long applied; kept for provenance. Additive + idempotent. |
| `004_roles_shifts.sql` | `roles`, `shifts` tables *(the `shifts` table was dropped by `065`)* |
| `005_departments.sql` | `departments` table |
| `006_role_detail_fields.sql` | Role description, capacity |
| `007_shift_date.sql` | Date field on shifts |
| `008_event_capacity_signup.sql` | Event capacity, `camp_signups` |
| `009_role_approval.sql` | `role_approval_status` on signups |
| `010_application_new_fields.sql` | `setup_preference`, `setup_limitations`, `setup_notes`, `avatar_url`, `pronouns`, etc. |
| `011_volunteer_new_fields.sql` | `preferred_name`, `pronouns` on volunteers |
| `012_schedule_all_hands.sql` | `is_recurring`, `highlight` on schedule events |
| `013_event_type.sql` | `event_type` column |
| `014_volunteer_signup_intent.sql` | `signup_intent` on volunteers (text) |
| `015_volunteer_signup_intent_array.sql` | Converts to `TEXT[]` |
| `016_schedule_contribution_type.sql` | `contribution_type` on schedule events |
| `017_role_suggestions.sql` | `role_suggestions` table, `user_notifications` table |
| `018_page_content.sql` | `page_content` table |
| `018_wizard_fields.sql` | Application wizard v2 fields: `find_at_camp` + `department_interests TEXT[]` on `applications`. *(Shares the `018` number with `page_content` — a historical collision; both are applied, order between them doesn't matter.)* |
| `019_schedule_event_date.sql` | `event_date DATE` on `schedule_events` |
| `020_announcements.sql` | `announcements` table |
| `021_event_category.sql` | `event_category TEXT` on `schedule_events` (default `'at_camp'`) |
| `022_messages.sql` | `messages` table with sender/recipient/body/read_at + indexes |
| `023_custom_answers.sql` | `custom_answers JSONB` on `applications` for admin-added form fields |
| `024_polls.sql` | `polls` and `poll_votes` tables |
| `025_rename_community_fields.sql` | Renames five community-specific columns on `applications` to generic equivalents: `glaum_acceptance → community_acceptance`, `attunement_status → onboarding_status`, `attunement_status_other → onboarding_status_other`, `draws_to_glaum → draws_to_community`, `camp_relationship → membership_type`. **Must be applied before next deploy.** |
| `026_notification_preferences.sql` | `notification_preferences` table |
| `027_messages_read.sql` | Message read/notification tracking on `messages` |
| `028_event_rsvps.sql` | `event_rsvps` table |
| `029_application_files_bucket.sql` | Public `application-files` storage bucket + read policy (for File-upload fields). **Must be applied** (or create the bucket manually). *The bucket is made private by `072`.* |
| `030_groups.sql` | `groups` + `group_members` tables. Backfills groups from distinct `setup_preference` values and memberships from approved members' selections. **Must be applied** before the Groups feature works. Idempotent. |
| `031_shoutouts.sql` | `shoutouts` table — member-posted shoutouts on the home dashboard. **Must be applied** before the Shoutouts widget works. |
| `032_message_sender_name.sql` | `sender_name` column on `messages` (snapshot of sender display name) + backfill from current application names. Lets conversations survive sender deletion. |
| `033_conversations.sql` | **Group messaging.** Adds `conversations` + `conversation_participants` tables; `messages.conversation_id` + `parent_message_id` (and makes `recipient_clerk_id` nullable); group governance columns (`join_policy`/`visibility` on `groups`, `role` on `group_members`). Backfills a conversation per group and per existing DM pair (preserving read state). Additive + idempotent; **must be applied** before group messaging works. |
| `034_group_badge_image.sql` | `badge_image` column on `groups` (later renamed to `icon_image` by `035`) + public `group-badges` storage bucket and read policy. Additive + idempotent. |
| `035_rename_group_badge_to_icon.sql` | Renames `groups.badge_image` → `groups.icon_image` (the per-group uploaded image, now called an "icon" in the UI/code; the emoji field stays `groups.icon`). Data preserved; bucket keeps its `group-badges` name. **Must be applied** — the profile + Groups admin select `icon_image`. |
| `036_public_profile_fields.sql` | **Curated public-profile fields.** `public_bio` + `public_skills` on `applications` — the About paragraph + Skills & Gifts chips on `/members/[id]`. Deliberately separate from the application answers (`about_you` / `special_skills`), which stay admin-only: members curate what the directory shows. Additive + idempotent. |
| `037_members_and_profiles.sql` | **`members` + `member_profiles`** (Phase 1 of profile-as-source-of-truth — see [profile-architecture.md](profile-architecture.md)). Splits the two roles `applications` played: `members` = canonical identity (one row per person, `clerk_user_id` the stable join key, `status` the membership gate); `member_profiles` = configurable profile values (1:1, keyed by `page_content.config_profile_fields` keys). Backfills one member per distinct person (by `clerk_user_id`, else `lower(email)`) from the most recent application. Additive + idempotent. |
| `038_member_distinctions.sql` | **Manually attributed distinctions** — the exception to "distinctions are derived, never stored". `member_distinctions` records distinctions an admin grants by hand (honorary / one-off / overrides); `evaluateDistinctions` **unions** these with the rule-derived ones (a rule with no conditions is "manual only"). Read via `lib/distinction-awards.ts`. Additive + idempotent. |
| `039_lead_up_gatherings.sql` | **Lead-Up Gatherings.** Adds `lead_up_events` + `lead_up_event_rsvps` tables — real-dated planning sessions on the runway to the event, separate from `schedule_events`. Additive + idempotent; **must be applied** before the feature works. See [`lead-up-gatherings.md`](./lead-up-gatherings.md). |
| `040_lead_up_notified.sql` | `notified_at TIMESTAMPTZ` on `lead_up_events` — tracks the "Notify members" broadcast. Additive + idempotent. |
| `041_lead_up_image.sql` | `image_url TEXT` on `lead_up_events` + public `lead-up-images` storage bucket & read policy. Additive + idempotent; **must be applied** (or create the bucket manually) before image upload works. |
| `042_group_collections.sql` | **Group Collections.** Adds `group_collections` + `groups.collection_id`; backfills uncollected groups into a default "Contributions" collection. |
| `043_group_collection_profile_visibility.sql` | `show_on_profile BOOL` on `group_collections`. |
| `044_group_collection_self_join.sql` | `self_join BOOL` on `group_collections` (collection-level Participate self-join gate; retires per-group `apply_selectable`). |
| `045_shifts_redesign.sql` | **Shifts redesign, first draft.** `event_types` registry + `schedule_events.event_type_id`/`requires_ack` + `member_shift_signups` (backfilled from `camp_signups`). The `event_types` half was superseded by `046`; `member_shift_signups` + `requires_ack` remain canonical. |
| `046_shift_types_reshape.sql` | **Shifts redesign, corrected model.** `shift_types` registry (requirement-free kinds); `schedule_events.participation_type` + `shift_type_id`; optional `required_shift_type_id`/`required_shift_hours` on `groups` **and** `roles`. Backfills from `045`'s seed; leaves `event_types` dormant. |
| `047_shift_times.sql` | `start_time`/`end_time` ("HH:MM") on `schedule_events` — shift durations for hours math (`lib/shift-hours.ts`). No backfill; times set in the schedule editor. |
| `048_participation_leads.sql` | **Participation leads.** Adds `role` (`'member'`/`'lead'`, default `'member'`) to `member_shift_signups` **and** `lead_up_event_rsvps` — members offer to lead what they join; the role lives on the participation row (dies with the signup; co-leads = multiple lead rows; display-only). Additive + idempotent. *(The `lead_up_event_rsvps` half is dropped by `050`.)* |
| `049_needs_lead.sql` | **Per-event lead opt-in.** `needs_lead BOOL` (default false) on `schedule_events` **and** `lead_up_events` — whether an event *has* a lead role is the organizer's call at creation; all member lead affordances (048) are gated on it, and the offer moves to signup/RSVP time. Additive + idempotent. *(The `lead_up_events` half is dropped by `050`.)* |
| `050_scrap_gathering_leads.sql` | **Scrap gathering leads.** Leads become a **shifts-only** concept: drops `lead_up_event_rsvps.role` + `lead_up_events.needs_lead` (the gathering halves of 048/049). **Destructive by design** — discards any recorded gathering-lead offers. Idempotent via `IF EXISTS`. |
| `051_shared_resources.sql` | **Shared resources.** `resource_lists` + `resources` + `resource_claims` — admin-authored needs ("4 camping stoves"), met by one-click member claims with quantities; totals always derived from claim rows. Additive + idempotent; **must be applied** before the feature works. See [`shared-resources.md`](./shared-resources.md). |
| `052_resource_list_stewards.sql` | **Resource-list stewards beyond groups.** Adds `department_id` + `role_id` to `resource_lists` (both `ON DELETE SET NULL`) + an at-most-one-steward CHECK (`resource_lists_one_steward`, exclusive arc over group/department/role). Stewardship stays display-only. Additive + idempotent. |
| `053_resource_offers.sql` | **Open-ended resource offers.** `resources.quantity_needed` becomes **nullable** (NULL = open callout, no set target) + adds `offered_by TEXT` (the member who listed it; NULL = admin-authored). Members offer unlisted gear; admins edit a target on (→ tracked need) or delete. Additive + idempotent. |
| `054_structured_event_times.sql` | **Structured event times everywhere.** Data-only (no schema change): backfills `schedule_events.start_time`/`end_time` from the free-text `time` (fills NULLs only) and converts `lead_up_events.start_time`/`end_time` display strings ("6:00 PM") to `"HH:MM"` in place. Unparseable values are left untouched (code renders them as-is via `clockLabel`). Idempotent. |
| `055_resource_item_icons.sql` | **Resource item icons.** `resources.icon TEXT` — optional image reference (asset-library path or uploaded `group-badges` URL, `resources/` prefix), following the `departments.icon` idiom. Additive + idempotent. *(Was briefly numbered 054 on the branch; renumbered at merge — 054 was taken by structured event times.)* |
| `056_attunement_nudges.sql` | **Attunement nudge emails.** Adds `email_attunement_nudges BOOL` (default TRUE) to `notification_preferences` + the `attunement_nudges` send ledger (one row per member: `last_sent_at`, `outstanding_count`, `nudge_count`). Additive + idempotent; **must be applied before deploying** the nudge branch — `getNotificationPreferences` selects the new column, and an errored select fails open to all-defaults-ON. |
| `057_recurrence_days.sql` | **Recurring events on chosen dates.** Adds `recurrence_days TEXT[]` (default NULL) to `schedule_events`: NULL = every day (old behavior, existing rows untouched), an array of ISO dates = only those days. Additive, non-destructive; **must be applied before deploying** this branch — the member `ScheduleSection` selects the new column. |
| `058_show_on_schedule.sql` | **Keep events off the schedule page.** Adds `show_on_schedule BOOL NOT NULL DEFAULT true` to `schedule_events`: FALSE = the event skips the schedule page (homepage embed + /schedule) and the home upcoming-events teaser while staying signable/ackable. Additive, non-destructive; **must be applied before deploying** — member queries filter on the new column. |
| `059_clerk_prod_remap.sql` | **Clerk dev→prod user-ID remap** (RESERVED — file is *generated*, not in the repo, by `scripts/migrate-clerk-to-prod.mjs --execute` once the prod users exist). Rewrites every stored Clerk ID (18 table/column pairs + derived `conversations.direct_key`) from the dev instance to the production instance via a temp mapping table, with per-column verification counts before COMMIT. Non-destructive (pure ID rewrite), re-runnable; apply during the key-swap cutover window. Runbook: [clerk-prod-migration.md](clerk-prod-migration.md). |
| `060_backfill_missing_members.sql` | **Backfill missing `members` rows from `applications`.** QA sweep 2026-07-03 found 4 approved applications (submitted June 27–30, before the profile-source-of-truth dual-write) with no `members` row — `getApprovedMember` gates every member-only surface on `members.status`, so those campers were locked out of /participate, /schedule, /members and /roles. Inserts a members row for any application with no clerk-id / email / application-id match in `members`. Pure INSERT (non-destructive), idempotent. The systemic hole is also closed in code: `/api/admin/[id]/approve` now mirrors via `upsertMember` (insert-or-update) instead of the update-only `setMemberStatus`. |
| `061_radio.sql` | **Radio.** Creates `radio_events` (the curated community feed — see [radio.md](radio.md)) + DESC index on `created_at`, and backfills one `welcome` post per approved application from `reviewed_at`. Additive + idempotent (guarded backfill), non-destructive; **applied in prod 2026-07-03** — the home dashboard teaser and `/radio` read the new table. |
| `062_push_tokens.sql` | **Push notification device tokens** (061 is reserved by the Radio branch). `push_tokens` table: one row per device a member granted notifications on (`clerk_user_id`, `platform` ios/android, unique FCM `token`, `created_at`/`last_seen_at`) + index on `clerk_user_id`. Registered by the native app via `POST /api/push/register`; dead tokens deleted when FCM reports them unregistered. Additive + idempotent; safe to apply before the app exists (`lib/push.ts` no-ops without tokens/config). |
| `063_member_suspension.sql` | **Member suspension.** Adds `suspended_at` / `suspended_by` / `suspension_note` to `members`. A member (self-serve) or an admin can suspend attendance: releases **all** the member's commitments — role + legacy shift (`camp_signups`), groups (`group_members`), shifts (`member_shift_signups`), resource claims (`resource_claims`) — and blocks new ones (`lib/suspension.ts`, gated in `/api/signup`, `/api/shift-signups`, `/api/groups/membership`, `/api/groups/[id]/join`, `/api/resources/claims`, `/api/resources/items`, `/api/resources/lists`) while keeping full read access and `status` intact. Suspended members are excluded from Overview participation counts (shown in their own box) and attunement nudges. Additive + idempotent, non-destructive (the column adds are; the commitment releases run at suspend time). |
| `064_shift_occurrence_date.sql` | **Per-night shift signups.** Adds `member_shift_signups.occurrence_date` (DATE, NULL = a non-recurring shift's single occurrence; a date = one night of a recurring event). Backfills existing recurring-event holds to the event's anchor date. Replaces the whole-event `UNIQUE` with two partial unique indexes (NULL-date vs dated) + an `occurrence_date` index. Recurrence becomes purely an authoring convenience: each night is treated as a regular shift everywhere (signup, capacity, roster, hours, ledger). Additive + idempotent. |
| `065_shifts_legacy_drop.sql` | **Shifts-redesign final cleanup (Phase 7).** Drops the dead `shifts` table; `camp_signups.shift_id` + `.schedule_event_id` (legacy single shift — `member_shift_signups` is the single source); `045`'s dormant `event_types` table + `schedule_events.event_type_id`; and the legacy `schedule_events` columns `contribution_type` / `event_type` / `all_hands` / `event_category`. Companion code change removes `/api/admin/shifts`, `lib/event-type-compat.ts`, and every legacy-column read/write. Opens with a **defensive orphan backfill** (any hold still living only in the legacy column is inserted into `member_shift_signups`, recurring events anchored to `event_date` per `064`'s convention) so the drop can't lose a live signup. **Destructive by design** (drops tables + columns); idempotent via `IF EXISTS` + a `NOT EXISTS` guard. Deploy the code first — it runs fine against a pre-`065` database. |
| `066_event_reminders.sql` | **Confirmation + reminder emails for gatherings & shifts.** Adds `email_event_reminders BOOL` (default TRUE) to `notification_preferences` — one opt-out governing both signup confirmations and the day-before / morning-of reminders — plus the `event_reminders_sent` ledger (one row per `clerk_user_id` × `target_date` × `phase` in `('day_before','morning_of')`; the `UNIQUE` is the dedupe so the twice-daily cron never double-emails). Additive + idempotent; **must be applied before deploying** — `getNotificationPreferences` selects the new column and an errored select fails open to all-defaults-ON. (Took `066` because `065` is claimed by the in-flight shifts-legacy-drop branch — renumber if numbers collide at merge.) |
| `067_camp_dues.sql` | **Camp dues.** Adds `dues_paid_at` / `dues_paid_by` / `dues_note` to `members` (mirrors the suspension columns). Non-NULL `dues_paid_at` = dues recorded paid; collected manually (email / e-transfer) this year, marked by an admin in Community → Camp Dues or `/admin/[id]`. Drives the new `dues` attunement requirement and the member `/dues` page. A future Stripe integration writes the same column. Additive + idempotent, non-destructive. *(Was 065 on the branch; renumbered at merge past 065 shifts-legacy-drop + 066 event-reminders.)* |
| `068_dues_self_report.sql` | **Dues self-report.** Adds `members.dues_reported_at`: a member marks that they've sent their e-transfer (`/api/dues/report`), creating an "awaiting review" state the admin confirms (→ `dues_paid_at`) or dismisses. Self-report counts as done for the member's attunement checklist so they aren't nudged after paying. Additive + idempotent, non-destructive. *(Was 066 on the branch.)* |
| `069_volunteer_dues.sql` | **Volunteer dues (audience option).** Adds `dues_paid_at` / `dues_paid_by` / `dues_note` to `volunteers`, so `config_dues.audience` can include volunteers (admin-tracked only — no self-report/attunement surface). Mirrors the member dues columns. Additive + idempotent, non-destructive. *(Was 067 on the branch.)* |
| `070_resource_list_dashboard.sql` | **Member-owned resources: dashboard opt-in.** Adds `resource_lists.show_on_dashboard` (BOOL NOT NULL DEFAULT false). The home "Bring Something" widget renders a compact row per list, but only for lists a member has opted in (default off, toggled in the list editor on `/participate`). Distinct from `visible` (participate board). Additive + idempotent, non-destructive. *(Numbered 070 — next free after main's 066–069; `065` stays reserved by the in-flight shifts-legacy-drop branch.)* |
| `071_group_welcome.sql` | **Per-member group welcome notes.** Adds `messages.visible_to` (TEXT, NULL = normal message; set = private system note only that member sees) + partial index; inserts any missing group conversations; **backfills one private welcome note per existing group membership** so every current member gets the "you're in this group" unread nudge retroactively. System notes use `sender_clerk_id = 'system'`. Additive + idempotent, non-destructive. **Two-part apply** (file is sectioned): Part A (schema) *before* deploy — the new readers filter on the column; Part B (backfill) *after* deploy — the old code doesn't filter `visible_to`, so earlier backfill would briefly show everyone's welcomes publicly. **Both parts applied in prod 2026-07-11.** |
| `072_application_files_private.sql` | **Security review 2026-08-27.** Makes the `application-files` bucket **private** + drops the public-read policy — applicant attachments were readable by anyone holding the object URL. Reads now go through GET `/api/apply/file?path=` (owner-or-admin → 60s signed URL); pre-`072` public URLs stored in old answers are rewritten to that route at render time (`lib/application-files.ts`). **Apply WITH/AFTER the code deploy** (applying first breaks existing file links until the new code is live). Non-destructive (no objects touched), idempotent. **Applied in prod 2026-08-27.** |
| `074_communities.sql` | **Multi-tenancy step 1a** ([tenancy-design.md](tenancy-design.md)). `communities` table + Glåüm seed row; `community_id` (NOT NULL, FK, indexed) on all 34 community-scoped tables, backfilled to Glåüm, with the **transitional default** `platform_default_community_id()` (dropped in `075`); `members.role` + `members.can_manage_polls`; `claim_shift_signup()` re-created to stamp `community_id` from the event (same signature). Unique constraints untouched until `075`. **Either deploy order is safe** (old code: defaults fill the column; new code: `lib/community.ts` falls back to a synthetic default community and warns until the table exists). Apply before branch 1b starts. Non-destructive, idempotent. |
| `073_claim_shift_signup.sql` | **Security review 2026-08-27.** `claim_shift_signup()` function — capacity count + signup insert in one advisory-locked transaction, replacing the route's racy read-then-insert (two concurrent signups could both take the last slot). Execute revoked from `public`/`anon`/`authenticated`, granted to `service_role` only. **Apply BEFORE/WITH the code deploy** — `/api/shift-signups` POST now calls it and 500s without it. Non-destructive, idempotent. **Applied in prod 2026-08-27.** |

---

### `attunement_nudges`

Send ledger for the attunement nudge emails (`GET /api/cron/attunement-nudges`, Vercel Cron — see `docs/architecture.md`). One row per member, upserted on every send; the cooldown against `last_sent_at` (from `config_attunement_nudge_days` × 24h, minus 4h drift slack) enforces the admin-set cadence and makes the daily cron idempotent under double fires.

| Column | Type | Notes |
|---|---|---|
| `clerk_user_id` | TEXT PK | |
| `last_sent_at` | TIMESTAMPTZ | last nudge email sent (cooldown anchor) |
| `outstanding_count` | INT | required + commitment items outstanding at send time (admin visibility) |
| `nudge_count` | INT | lifetime nudges sent to this member |

The member opt-out lives on `notification_preferences.email_attunement_nudges` (default ON; toggle in `/profile#notifications`).

---

### `lead_up_events`

Real-dated planning/brainstorming gatherings on the runway to the event — deliberately separate from `schedule_events` (the at-camp program) so none of the camp machinery (group `contribution_type` matching, capacity-per-role, attunement) applies. Surfaced on `/schedule` ("Before We Gather") and the home dashboard teaser.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | TEXT | |
| `description` | TEXT | |
| `event_date` | DATE | real calendar date (not a camp-relative slot label). NULL = TBD on legacy rows; the editor now **requires** a date (the admin month calendar needs one to place the gathering) |
| `start_time` | TEXT | `"HH:MM"` 24-hour since `054` (was a display string like `"6:00 PM"`); **required** by the editor. Rendered via `clockLabel` (`lib/shift-hours.ts`), which passes unconverted legacy strings through |
| `end_time` | TEXT | optional, same `"HH:MM"` format |
| `location` | TEXT | physical place (optional) |
| `link` | TEXT | virtual link, e.g. Zoom/Meet (optional) |
| `host` | TEXT | who's running it (optional) |
| `image_url` | TEXT | optional banner image (public `lead-up-images` bucket); rendered on the /schedule cards + announcement email |
| `visible` | BOOL | shown to members |
| `sort_order` | INT | tiebreak ordering (date is primary) |
| `notified_at` | TIMESTAMPTZ | when members were last alerted (bell + email) via the admin "Notify members" button; NULL = never. Drives the manager's "Notified" state. |

---

### `lead_up_event_rsvps`

Per-session RSVP to a lead-up gathering. Presence of a row = "I'll be at this planning session" — a headcount only; **never** touches attunement, shifts, or `camp_signups`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `lead_up_event_id` | UUID FK → `lead_up_events.id` (ON DELETE CASCADE) | |
| `clerk_user_id` | TEXT | |
| `status` | TEXT | defaults `'going'`; exists so a future three-state RSVP needs no migration |
| | | `UNIQUE (lead_up_event_id, clerk_user_id)` |

*(Gathering leads — a `role` column here + `needs_lead` on `lead_up_events` — were built and scrapped 2026-07-02; dropped by migration `050`. Leads are shifts-only.)*

---

### `resource_lists`

A named collection of shared resources ("Shared Kitchen", "Setup Equipment") — the gear members bring to the event. Community-scoped by design: no polymorphic *owners* and no event scoping (see [`shared-resources.md`](./shared-resources.md) → Non-goals). **Member-owned since 2026-07-08** — created and edited by any approved member on `/participate` → Bring Something; the admin console surface was removed and **no owner column** was added (editing is wiki-open, list deletion is admin-gated via `requireAdmin`). The `group_id`/`department_id`/`role_id` **steward** columns (at most one, exclusive-arc CHECK `resource_lists_one_steward`, migration `052`) survive on legacy admin-made lists as display-only context but are **no longer settable** (the steward picker left with the admin UI). `visible` is likewise no longer toggleable — member-created lists are live immediately.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `title` | TEXT | |
| `description` | TEXT | optional |
| `group_id` | UUID FK → `groups.id` (ON DELETE SET NULL) | steward, group flavour |
| `department_id` | UUID FK → `departments.id` (ON DELETE SET NULL) | steward, department flavour (migration `052`) |
| `role_id` | UUID FK → `roles.id` (ON DELETE SET NULL) | steward, role flavour (migration `052`) |
| `visible` | BOOL | shown to members on `/participate` → "Bring Something" (member lists are always visible; legacy hidden = admin work-in-progress) |
| `show_on_dashboard` | BOOL | default **false** (migration `070`). Opt-in: when on, the list appears as a row on the home "Bring Something" dashboard widget. Toggled in the list create/edit form on `/participate`. Distinct from `visible` (which governs the participate board) |
| `sort_order` | INT | default 0; display falls back to `created_at` |

---

### `resources`

One item per row within a list — either a **need** (has a target) or an **open offer/callout** (no target, migration `053`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `list_id` | UUID FK → `resource_lists.id` (ON DELETE CASCADE) | |
| `name` | TEXT | e.g. "Camping stove" |
| `note` | TEXT | optional, e.g. "two-burner, with propane" |
| `quantity_needed` | INT | ≥ 1, **or NULL** = open offer with no set target (migration `053`). Any approved member sets or edits it (blank = open offer, a number = tracked need) via the member items routes |
| `offered_by` | TEXT | clerk_user_id of the member who added it; NULL = legacy admin-authored (migration `053`). A member retracting their own offer's claim deletes the row if nobody else has claimed |
| `icon` | TEXT | optional icon image reference (asset-library path or uploaded `group-badges` URL, `resources/` prefix — migration `055`); shown on member cards + profile BRINGING rows. Set only on legacy admin-authored items — the member create flow does not set icons in v1 (default ✦) |
| `sort_order` | INT | default 0; display falls back to `created_at` |

---

### `resource_claims`

A member's "I'll bring one" — one row per member per resource, carrying a quantity (three coolers = one row, quantity 3). A claim **is** the confirmation (no pledge→confirm workflow); deleting the row unclaims. Fulfilled totals are always **derived** by summing claim rows — never stored.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `resource_id` | UUID FK → `resources.id` (ON DELETE CASCADE) | |
| `clerk_user_id` | TEXT | |
| `quantity` | INT | ≥ 1 (API clamps to 1–99; 0 = delete the row) |
| `updated_at` | TIMESTAMPTZ | bumped on quantity change |
| | | `UNIQUE (resource_id, clerk_user_id)` |

---

### `polls`

Admin-created polls shown to approved members on the dashboard.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `question` | TEXT NOT NULL | The poll question |
| `options` | JSONB NOT NULL | Array of option strings e.g. `["Yes", "No", "Maybe"]` |
| `visible` | BOOL NOT NULL | Whether shown to members. Default `true` |
| `allow_multiple` | BOOL NOT NULL | Allow members to select more than one option. Default `false` |
| `expires_at` | TIMESTAMPTZ | Auto-closes after this date. NULL = open indefinitely |
| `created_at` | TIMESTAMPTZ NOT NULL | |

---

### `poll_votes`

One row per member per option voted on.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `poll_id` | UUID FK → `polls.id` ON DELETE CASCADE | |
| `clerk_user_id` | TEXT NOT NULL | Voter |
| `option_index` | INT NOT NULL | Zero-based index into `polls.options` |
| `created_at` | TIMESTAMPTZ NOT NULL | |

**Unique constraint:** `(poll_id, clerk_user_id, option_index)` — one vote per option per member. Votes are replaced (not accumulated) when a member changes their answer: the API deletes existing votes for that poll+user then re-inserts.
