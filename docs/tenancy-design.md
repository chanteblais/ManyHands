# Multi-Tenancy Design — Phase 1 Foundation

**Status: decisions 1–5 approved as recommended (Chanté, 2026-09-11). Branch 1a
(`feat/tenancy-schema`) built the same day — migration `074`, `lib/community.ts`,
`lib/tenant-db.ts`, the scope guard, `CommunityProvider` — merged; migration 074 applied in prod.
Branch 1b (`feat/tenancy-identity`) built the same day: identity, config and email libs
take the community explicitly; 32 files fully on `tenantDb`; every member/admin route
resolves the community once. Branch 1c (`feat/tenancy-program`) built the same day: the
remaining 17 libs and 77 routes/pages/components — **allowlist empty; no raw client anywhere
in feature code.** Next: 1d (roles, crons, storage, picker, migration 075).** Drafted 2026-09-11 from a full inventory of the schema (36 tables), config layer,
auth and data access (94 API routes, ~500 `.from()` call sites). Supersedes the Phase 1 sketch in
[`multi-community.md`](./multi-community.md) (kept there as history).

**Goal:** the platform serves many communities from one codebase, one database, one deployment.
Glåüm becomes community 1 with **zero visible change**. A second community can be stood up by
inserting rows and pointing a host at the deployment. The shared Many Hands app
([`mobile-companion.md`](./mobile-companion.md) → App Store path) logs a person in once and shows
the communities they belong to.

**Non-goals for Phase 1** (each gets its own track later): the Event-as-first-class-object /
event-mode toggle (business.md open question #6); folding `volunteers` into `members`; per-community
notification preferences; self-service community creation UI; custom-domain automation;
Clerk-domain move (only needed when tenant 2 gets its own host).

---

## Decisions needed from Chanté

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | **Where admin roles live** — Clerk `publicMetadata` (today) vs the database | **Database:** `members.role` (`member` \| `admin`) + `members.can_manage_polls`. Chanté keeps a **platform-owner** flag in Clerk `publicMetadata.platformRole = 'owner'` that overrides everything. | Admin is a *per-community* fact; a person can run one community and be a plain member of another. DB roles make "email this community's admins" a one-table query (fixes `notify-admin.ts`'s Clerk-wide 100-user listing) and keep Clerk as pure identity. Cost: the edge admin wall in `proxy.ts` becomes "signed in"; the real check moves into pages/routes (already `requireAdmin()` everywhere). Clerk Organizations were evaluated and rejected: they'd duplicate the `members` table and add a sync problem for no gain. |
| 2 | **One Clerk instance for the whole platform** | **Yes.** Glåüm's current production instance *becomes* the platform instance. | "One login, many communities" requires one identity provider. No change until tenant 2 needs its own host; then the platform root domain becomes Clerk's primary and `camp.glaum.ca` a satellite (or redirect). |
| 3 | **Tenant resolution** — by host, by path prefix, or by session | **By host**, with an env fallback for dev/single-host: `communities.hosts text[]`; unknown host → `DEFAULT_COMMUNITY_SLUG` (prod: `glaum`) until the platform root exists. | Bespoke feel (each community keeps its own URL), existing Glåüm links unchanged, no page moves. Path-prefix (`/c/glaum/…`) would relocate every route and break every link. Session-based breaks deep links and shareable URLs. |
| 4 | **RLS safety net** — now, or after the code sweep | **After the sweep, before tenant 2 goes live** (Phase 1e). | Row-level policies keyed on a request claim guarantee no cross-tenant leak even if a query forgets its filter. They're a second belt, not the primary mechanism, so they don't block the sweep — but they must exist before real second-community data enters the DB. |
| 5 | **Theme tokens** — in scope now, or parallel track | **Parallel track** (Phase 1f), required before tenant 2 wants its own colours, not required for tenancy. | ~1,210 inline hex colours across 110 files; zero colour tokens consumed today. Mechanical, scriptable, independent of tenancy. |

---

## 1. Data model

### 1.1 `communities` — the tenant row

```sql
create table communities (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,                 -- 'glaum'; URL-safe, immutable
  name         text not null,                        -- 'Glåüm'
  description  text,
  hosts        text[] not null default '{}',         -- ['camp.glaum.ca']; resolution key
  timezone     text not null default 'UTC',          -- 'America/Vancouver'; crons + "today"
  event_name   text,                                 -- 'What If 2026' (interim; Event object later)
  email_from   text,                                 -- 'Glåüm Camp <hello@glaum.ca>'; null → platform default
  theme        jsonb not null default '{}',          -- colour/font tokens (Phase 1f)
  settings     jsonb not null default '{}',          -- small platform-level knobs (feature toggles later)
  status       text not null default 'active' check (status in ('active','paused','archived')),
  created_at   timestamptz not null default now()
);
create unique index communities_hosts_uniq on communities using gin (hosts); -- see note
```
(Host uniqueness is enforced in app code on write; a GIN index serves lookup. A trigger-enforced
uniqueness across array elements can come with the self-service creation UI.)

**`page_content` remains the per-community content/config store** — it just gains a scope column.
`communities` carries only what must exist *before* `page_content` can be read (identity, host,
timezone, sender) plus theme. Everything already in `page_content` stays there.

### 1.2 `community_id` on every scoped table

Every table except `push_tokens` and `notification_preferences` gets
`community_id uuid not null references communities(id)` plus an index. **Child tables get it too**
(denormalized), even where a parent FK already scopes them: `messages`, `conversation_participants`,
`group_members`, `member_shift_signups`, `event_rsvps`, `lead_up_event_rsvps`, `resources`,
`resource_claims`, `poll_votes`, `member_profiles`, `member_distinctions`, `roles`. Reason: every
query, every RLS policy, and every storage/notification path can then scope on one column
without joins. Consistency between child and parent `community_id` is the app's job (the scoped
client sets it) and RLS's job (policies check the column).

Stays global: `push_tokens` (a device belongs to a person), `notification_preferences`
(per person in Phase 1 — a person-level "email me" switch; per-community prefs are a later
migration: composite PK).

### 1.3 Uniqueness constraints that must become community-scoped

| Table | Today | Becomes |
|---|---|---|
| `members` | `clerk_user_id` UNIQUE | `(community_id, clerk_user_id)` UNIQUE — one member row per person per community |
| `camp_signups` | `clerk_user_id` UNIQUE | `(community_id, clerk_user_id)` |
| `page_content` | `key` PK | `(community_id, key)` PK |
| `attunement_nudges` | `clerk_user_id` PK | `(community_id, clerk_user_id)` PK |
| `event_reminders_sent` | `(clerk_user_id, target_date, phase)` | `(community_id, clerk_user_id, target_date, phase)` |
| `conversations` | partial unique `direct_key` (`a\|b`), partial unique `group_id` | `(community_id, direct_key)`, `group_id` stays (groups are scoped) |
| `shift_types` | `backfill_key` UNIQUE | `(community_id, backfill_key)` |
| `applications` | one row per `clerk_user_id` (app-enforced) | one per `(community_id, clerk_user_id)` (app-enforced; add UNIQUE) |

Child-table uniques (`group_members (group_id, clerk_user_id)`, `poll_votes`, `event_rsvps`,
`resource_claims`, `member_shift_signups` partials) are already safe via scoped parents.

### 1.4 Identity vs membership

- **Person** = Clerk user. Global. Never gets a `community_id`.
- **Membership** = a `members` row per (community, person). Status, dues, suspension, role, profile
  values (`member_profiles`) are all per-membership. The same person in two communities has two
  rows, two profiles, two attunement states, two sets of distinctions. This matches the product:
  your standing in the retreat is not your standing in the camp.
- `lib/members.ts` `resolveMember`/`getApprovedMember`/`upsertMember` all take `communityId`.
  The email-fallback lookup (`ilike email`) stays but is scoped.

### 1.5 Migrations 074 + 075

**Split (decided while building 1a):** three live upserts target constraints the design replaces
(`camp_signups` on `clerk_user_id`, `page_content` on `key`, `attunement_nudges` on
`clerk_user_id`), so swapping constraints in 074 would break them before the sweep reaches those
files. Therefore:

- **`074_communities.sql` (written, branch 1a)** — purely additive: `communities` + Glåüm seed,
  `community_id` on all 34 scoped tables (backfilled, NOT NULL, indexed) with the **transitional
  default** `platform_default_community_id()` so un-swept inserts keep working, `members.role` /
  `can_manage_polls`, and `claim_shift_signup()` stamping `community_id` from the event. Safe in
  either deploy order.
- **`075` (end of the sweep, branch 1d)** — drops the transitional default and its function, and
  performs the constraint swaps below. Only after 075 may a second community exist.

The constraint swaps, for 075 (non-destructive; one transaction):
```sql
begin;
-- drop the 1a bridge:
do $$ declare t text; begin
  foreach t in array (…the 34 scoped tables…) loop
    execute format('alter table %I alter column community_id drop default', t);
  end loop; end $$;
drop function platform_default_community_id();

-- constraint swaps (§1.3):
alter table members drop constraint members_clerk_user_id_key;
alter table members add constraint members_community_user_uniq unique (community_id, clerk_user_id);
alter table camp_signups drop constraint camp_signups_clerk_user_id_key;
alter table camp_signups add constraint camp_signups_community_user_uniq unique (community_id, clerk_user_id);
alter table page_content drop constraint page_content_pkey;
alter table page_content add primary key (community_id, key);
alter table attunement_nudges drop constraint attunement_nudges_pkey;
alter table attunement_nudges add primary key (community_id, clerk_user_id);
alter table event_reminders_sent drop constraint event_reminders_sent_clerk_user_id_target_date_phase_key;
alter table event_reminders_sent add constraint event_reminders_sent_uniq unique (community_id, clerk_user_id, target_date, phase);
drop index conversations_direct_uniq;
create unique index conversations_direct_uniq on conversations (community_id, direct_key) where direct_key is not null;
alter table shift_types drop constraint shift_types_backfill_key_key;
alter table shift_types add constraint shift_types_community_backfill_uniq unique (community_id, backfill_key);
alter table applications add constraint applications_community_user_uniq unique (community_id, clerk_user_id);

commit;
```
Exact constraint names to be confirmed against the live DB before 075 is finalized (default
names shown). `claim_shift_signup()` keeps its 073 signature — 074 already stamps the signup
from the event row, and 075 scopes the capacity count by the event's community.

---

## 2. Request context — resolving the community

**`lib/community.ts`** (new):
- `getCommunity(): Promise<Community>` — server-only. Reads the request `host` (via `headers()`),
  looks it up in `communities.hosts` (cached with `unstable_cache`, tag `communities`), falls back to
  `DEFAULT_COMMUNITY_SLUG` (env; `glaum` in prod, dev) when the host is unknown (localhost, preview
  URLs). Throws `CommunityNotFound` only when neither resolves — the platform-root landing/picker
  handles that case (§6).
- `getCommunityBySlug(slug)`, `listCommunitiesForUser(clerkUserId)` (joins `members`).
- `Community` type = the row; `theme`/`settings` parsed.

**Middleware stays Clerk-only.** `proxy.ts` no longer needs the community: the admin wall there
becomes "signed in" for `/admin(.*)` and `/api/admin(.*)`; the real role check is
`requireCommunityAdmin()` in every admin page/route (§4). No DB call at the edge.

**Client components** get the community through a `CommunityProvider` mounted in `app/layout.tsx`
(server layout resolves it once; passes `{ id, slug, name, eventName, theme }` down). This is also
where theme tokens become CSS custom properties on `<html>` (Phase 1f). `lib/site-config.ts`'s
module-scope `SITE_NAME`/`EVENT_NAME`/`SITE_DESCRIPTION` are deleted; the 15 consumers read
`community.name` etc. (`app/manifest.ts` and `app/layout.tsx` metadata become dynamic).

**The native app** hits the community's host in its webview, so resolution is identical. A future
bearer-token JSON API would pass `x-community: <slug>`; `getCommunity()` checks that header first.

---

## 3. Data access — the scoped client

**`lib/tenant-db.ts`** (new): `db(communityId)` returns a thin wrapper over `supabaseAdmin`:
- `db(cid).from('members').select(...)` → applies `.eq('community_id', cid)` automatically.
- `.insert(rows)` → stamps `community_id` on every row (and refuses rows that carry a *different* one).
- `.update(...)` / `.delete()` → `.eq('community_id', cid)` applied.
- `db(cid).storage` → returns bucket helpers that prefix object paths with `${cid}/` (§5).
- Tables in a small `GLOBAL_TABLES` set (`push_tokens`, `notification_preferences`, `communities`)
  pass through unscoped.

**Enforcement:** `npm run check` gains a guard (`scripts/check-tenant-scope.mjs`) that fails on any
`supabaseAdmin.from(` / `supabaseAdmin.storage.from(` outside an allowlist (`lib/tenant-db.ts`,
`lib/community.ts`, the migration/maintenance scripts). Raw `supabaseAdmin` becomes a private
detail of the wrapper. This is what makes the sweep converge: `tsc` finds signature changes, the
guard finds forgotten call sites.

**The sweep itself** is mechanical but large (~500 call sites across `lib/` data modules, 94 routes,
23 server-component pages). Every `lib/` data function gains a leading `communityId` parameter;
every route/page calls `const community = await getCommunity()` once and passes `community.id`
down. Per-area branches (§8) keep each PR reviewable.

**Caches:** `lib/page-content.ts` keys and tags become `page-content:${cid}`; the PATCH route
revalidates the scoped tag. The badge route's in-process render cache is keyed by community too
(§5). `lib/push.ts`'s FCM token cache is platform-level and stays.

---

## 4. Auth and roles

- **Member gate** (`getApprovedMember`, `getShiftParticipant`, `requireApprovedCamper`): unchanged
  shape, now `(communityId, clerkUserId)`.
- **Community admin:** `requireCommunityAdmin(communityId)` in `lib/admin-auth.ts` — true when the
  caller's `members` row in this community has `role = 'admin'`, **or** the caller is a platform
  owner. `requireAdmin()` is renamed so every call site is touched deliberately. Poll managers:
  `members.can_manage_polls` (replaces `publicMetadata.canManagePolls`).
- **Platform owner:** Clerk `publicMetadata.platformRole === 'owner'` (Chanté). Can act as admin
  in any community; the only identity that can create communities (SQL/seed script in Phase 1;
  UI later). The session-token claim already exposes `metadata`, so this stays cheap.
- **Admin management routes:** `POST /api/admin/set-admin` and `set-poll-manager` write
  `members.role` / `can_manage_polls` in the current community instead of Clerk metadata.
  One-off backfill script copies today's Clerk flags into Glåüm's `members` rows.
- **`notify-admin.ts`:** recipients = `members where community_id = ? and role = 'admin'`
  (emails from Clerk by id, as today). The Clerk `getUserList` scan goes away.
- **Crons** currently accept "signed-in admin" as an alternative to `CRON_SECRET` for dry runs:
  that becomes "platform owner".
- **`proxy.ts`:** protected matcher unchanged; the metadata-based admin wall is reduced to a
  signed-in check (the per-route check is the real wall — it already is on every admin route).

---

## 5. Storage, assets, badge

- All new uploads go to `${community_id}/…` inside the existing buckets (`avatars`, `group-badges`,
  `schedule-icons`, `lead-up-images`, `application-files`). Existing Glåüm objects stay where they
  are — tables store full URLs/paths, so nothing breaks; no object move.
- **`application-files` (private):** the signed-URL read route verifies the requested path's
  community prefix matches the caller's community (or the object is a legacy unprefixed Glåüm
  path and the caller is in Glåüm).
- **Badge:** `communities.theme.badge` = `{ base_url, font_url, width, height }`; `/api/badge`
  takes `?c=<slug>` (it is unauthenticated and can't read a session), loads assets by URL with a
  per-community in-process cache, and the mtime-based version scheme becomes a content hash of
  the base asset. Glåüm's defaults point at today's `public/` files so nothing changes.

---

## 6. Cross-community surfaces (what the shared app needs)

- **`GET /api/me/communities`** → `[{ slug, name, host, status: 'approved'|'pending', role }]`
  for the signed-in person (from `members` × `communities`). The native switcher and the web
  picker both consume this. This is the only new member-facing endpoint Phase 1 adds.
- **Platform root host** (once it exists; env `PLATFORM_HOST`): no community resolves → render
  the **picker** (`/communities`): your communities, or the **no-community empty state** ("ask
  your organizer for an invite"; join-by-code is a later feature). Until the root host exists
  this page is reachable only by direct path on any community host.
- **Push payloads** add `community: <slug>` alongside the app-relative `link`, so the app can
  switch host before opening the path. `push_tokens` stays per person; the sender is per
  community.
- **Email:** `lib/send-email.ts` functions take `community` and build links from
  `https://${community.hosts[0]}`; sender = `community.email_from ?? PLATFORM_EMAIL_FROM`;
  wordmark/footer/subject use `community.name`. The module-scope `APP_URL`/`FROM` constants and
  every "Glåüm" string literal in email bodies go away in this pass (~14 hits in `send-email.ts`,
  ~10 more across admin routes).

---

## 7. Crons

One Vercel cron per job, **hourly**, sweeping all active communities:
- `attunement-nudges`: for each community, compute local hour from `communities.timezone`; run
  the sweep only when it equals the community's send hour (`settings.nudge_hour_local`, default 9).
  Cadence + event date still come from that community's `page_content`.
- `event-reminders`: same shape; `morning_of` / `day_before` phases fire at per-community local
  hours (defaults 8 and 19). `lib/event-reminders.ts`'s hardcoded `CAMP_TZ` goes away.
- Ledgers (`attunement_nudges`, `event_reminders_sent`) are community-scoped (§1.3), so a person
  in two communities gets each community's reminders. `vercel.json` shrinks to two hourly entries;
  `ATTUNEMENT_NUDGE_UTC_HOUR` is deleted.

---

## 8. Sequencing — branches, in order

Each is one reviewable branch with the standing checks (`npm run check` + click-through). Glåüm
must be pixel-identical after every merge; production keeps resolving `camp.glaum.ca` → glaum.

| Step | Branch | Contents | Done when |
|---|---|---|---|
| 1a | `feat/tenancy-schema` — **built 2026-09-11** | Migration 074 (additive; constraint swaps deferred to 075), `lib/community.ts`, `lib/tenant-db.ts`, the scope guard script (allowlist = 117 files, shrinking per step), `CommunityProvider` mounted in the root layout, `DEFAULT_COMMUNITY_SLUG`. No call-site changes. | Migration applied; app unchanged; `getCommunity()` returns glaum everywhere. |
| 1b | `feat/tenancy-identity` — **built 2026-09-11** | `members`/`applications`/`volunteers`/profile/apply/approve/suspension/dues + `page_content` (per-community cache tags) + site-config consumers (layout metadata, manifest, install prompt) + email (community-branded sender/links/wordmark)/notify/notify-admin; `globalDb()` for person-level tables; every route/page that calls a changed lib resolves `getCommunity()` once. Allowlist 133 → 94 (the guard also learned relative imports). | Guard allowlist no longer contains these files. ✔ |
| 1c | `feat/tenancy-program` — **built 2026-09-11** | groups/collections/departments/roles/shift types/schedule/shift signups/lead-up/resources/polls/radio/announcements/shoutouts/distinctions/messaging + admin dashboards + dev pages + crons (single-community resolution; loop is 1d). Every exported querying lib function takes `communityId` first. Allowlist 94 → 0. | Allowlist empty. ✔ |
| 1d | `feat/tenancy-auth-crons` | DB roles + backfill script, `requireCommunityAdmin`, `proxy.ts` wall change, set-admin routes, hourly crons, storage prefixing, badge by slug, `/api/me/communities` + picker + empty state, **migration 075** (drop transitional default; constraint swaps). | Guard allowlist empty; `npm run check` green; 075 applied. |
| 1e | `feat/tenancy-rls` | RLS policies on all scoped tables keyed on a `community_id` JWT claim; `tenant-db` mints a per-request scoped token instead of using the service key. | A deliberate unscoped query returns zero rows in a test. |
| 1f | `ux/theme-tokens` (parallel, any time) | Colour tokens in `globals.css`, inline hexes → `var(--…)`, `communities.theme` → `<html style>`; behaviour-identity check (screenshots before/after). | Glåüm renders identically; a second theme object re-skins the site. |
| 2 | `feat/second-tenant` | Seed script for a fictional demo community (the App Review / showcase asset), then the real tenant 2: Clerk primary → platform root, `camp.glaum.ca` satellite, host rows, per-community Resend sender. | Two communities live on one deployment. |

Steps 1b and 1c are the bulk (the ~500-call-site sweep); they can be split further by area if a
branch gets too big to review.

---

## 9. What Phase 1 deliberately leaves single-community (log rows exist)

Event as a first-class object (event-mode toggle) · `volunteers` as a parallel person table ·
per-community notification preferences · terminology keys ("Attunement", "Many Hands") ·
"Shrimp" column → `custom_answers` · `DEPT_OPTIONS` · radio open-mic policy · form-config
default labels that interpolate the community name (fine as defaults; they're seeded per
community).

---

## 10. Verification plan

- `npm run check` (tsc + route-auth audit + **new scope guard**).
- **Zero-visible-change click-through** after 1a–1d on Glåüm: apply → approve → groups → shifts →
  messages → radio → dues → admin console; compare against `docs/qa-log.md` flows.
- **Two-tenant test** (local): insert a second community with host `localhost:3002`, run a second
  dev server from a worktree on that port, confirm members/pages/`page_content` are disjoint and
  that a person with member rows in both sees both in `/api/me/communities`.
- **Leak test** (1e): a raw `supabaseAdmin` query with the scoped token and no filter returns
  only that community's rows.
