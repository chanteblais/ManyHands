# Architecture

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Auth | Clerk (`@clerk/nextjs` v6) |
| Database + Storage | Supabase (Postgres + Storage) |
| Styling | Tailwind CSS + custom CSS |
| Language | TypeScript |
| Deployment | Vercel |

---

## Data Fetching Pattern

**Server components** fetch directly using `supabaseAdmin` (service role key). No auth check needed — server-only code never reaches the client.

**Client components** never import Supabase directly. They call internal API routes (`/api/...`) which are server-side and can safely use the service role key.

```
Server Component  →  supabaseAdmin (direct)
Client Component  →  fetch('/api/...')  →  API Route  →  supabaseAdmin
```

`lib/supabase.ts` exports `supabaseAdmin` via a lazy Proxy pattern that defers instantiation until first use, avoiding build-time errors when env vars aren't available.

---

## Auth

Auth is handled by **Clerk** (`@clerk/nextjs` v6). The Clerk middleware runs on all routes via `proxy.ts` (Next 16's rename of the `middleware.ts` convention).

- Admin role is set in Clerk Dashboard → User → `publicMetadata.role = 'admin'`
- `lib/profile-auth.ts` provides a shared helper to verify auth in server components and API routes
- **Admin gate:** `lib/admin-auth.ts` → `requireAdmin()` is the single admin check for the admin pages and every `/api/admin/*` route (returns the admin's `userId` or `null`). It reads `role === 'admin'` from `sessionClaims.metadata` — zero network calls — and falls back to a Clerk Backend-API `getUser` whenever the claim doesn't positively confirm an admin (absent, differently shaped, or minted mid-config); the claim is a fast path only and can never lock a real admin out. The claim requires one-time Clerk Dashboard config: **Sessions → Customize session token → `{"metadata": "{{user.public_metadata}}"}`**; until that's set, the fallback keeps everything working at the old (slow) speed. Role changes propagate on the member's next token refresh (~60s). Never re-add per-route inline `getUser` admin checks, and never read many users with per-user `getUser` calls — batch with `getUserList({ userId: [...] })` (see Admin → Configure)
- **Central admin wall (`proxy.ts`, 2026-08-27 security follow-up):** `/admin(.*)` pages and `/api/admin(.*)` routes are *additionally* walled in the Clerk middleware, before any handler runs — signed-out callers get 401 JSON (APIs) / the sign-in redirect (pages); signed-in non-admins get 403 JSON / a redirect to `/`. It uses the same claim-fast-path + backend-read semantics as `requireAdmin()` (shared `hasAdminRole` in `lib/admin-auth.ts`), so it can't lock out an admin the per-route gate would admit. Per-route `requireAdmin()` calls **stay** — defense in depth, and they resolve the `userId` — but a route that forgets its gate is no longer exposed. One exemption: `/api/admin/polls(.*)` (poll managers aren't admins — `requirePollManager` gates it in-route; the audit below asserts that gate stays). Side effect: the member-readable `GET /api/admin/announcements` view is now unreachable for non-admins — harmless, only the admin `AnnouncementsManager` ever called it.
- **Route-auth audit (`scripts/check-route-auth.mjs` → `npm run check:routes`, 2026-08-27):** statically asserts every `app/api/**/route.ts` contains a recognized gate (`requireAdmin`, `requirePollManager`, `await auth()`, `CRON_SECRET`) and that `/api/admin/*` files use an admin-tier one. Intentionally public routes must be allowlisted *in the script* with a reason (currently none exist). It's a file-level heuristic — the per-handler rule below still applies — but together with the proxy wall, the forgotten-gate class is covered twice. Runs in CI (`.github/workflows/ci.yml`: `npm ci` → `typecheck` → audit, on pushes and PRs); locally `npm run check` runs both.
- **The gate is per-handler, not per-file.** Every exported handler in an `/api/admin/*` route needs its own `requireAdmin()` line — a gated `POST` does nothing for an ungated `GET` beside it. Five list GETs (`groups`, `roles`, `departments`, `shift-types`, `group-collections`) were unauthenticated this way until 2026-07-16: `requireAdmin` was imported and used on the writes only, so the reads served the registry config to anyone. Two deliberate exceptions, neither a precedent for skipping the gate: **`GET /api/admin/announcements`** takes `auth()` alone and returns only the *visible, unexpired* subset — the member-readable view, with `/announcements/all` as the admin one; and **`/api/admin/polls*`** gates on `requirePollManager` (admin **or** `publicMetadata.canManagePolls`), the only admin-namespaced route a non-admin may reach. Member-facing pages never call `/api/admin/*` — they read the same registries server-side through `lib/` (e.g. `lib/group-collections.ts`), which is why gating the reads breaks nothing.
- `RememberSignedIn` component writes a localStorage flag so `HeaderClient` can show the right nav state without a round-trip
- `/api/nav-auth` trusts only Clerk-verified sessions (`auth()`); an earlier unverified `__session`-cookie fallback was removed 2026-07-02 — post-sign-in flakiness is covered by `HeaderClient`'s retry loop instead
- `/api/sign-out` resolves the user for session revocation from `auth()` first, falling back only to `verifyToken` (networkless JWKS check) on the raw `__session` cookie; an earlier unverified base64 parse of the JWT was removed 2026-07-02 (a forged `sub` could revoke any known user's sessions). Cookie-clearing runs regardless, so sign-out still works mid-broken-session
- **Nav auth state is server-rendered:** `components/Header.tsx` (server) resolves `auth()` + the member row per request and passes `initialAuth` to `HeaderClient`, so the first paint shows the correct nav — no signed-out flash, and no `/api/nav-auth` fetch on mount (that route survives as the no-prop fallback). The Header uses `resolveMemberForUser` — the same resolver as the pages' own gates — so the nav can never disagree with the page about membership (the email fallback only fires on a clerk-id miss; linked rows stay on the indexed fast path). `resolveMember` and Clerk's `currentUser()` are request-cached, so the Header shares the lookups with any page that already resolved the member. **Self-heal:** if that server render resolves signed-out/not-approved while the client's Clerk session is valid (a transient SSR auth hiccup, or on localhost the dev-instance `clerk_user_id` split where the email fallback can miss), `HeaderClient` re-polls `/api/nav-auth` once — the nav corrects itself without a manual refresh instead of sitting on the public links.
- **Member lookup (perf):** `lib/members.ts` → `resolveMemberForUser` / `getApprovedMember` is the standard "who is this signed-in user" check for pages and API routes. It queries `members` by `clerk_user_id` first (every production row has it) and only falls back to Clerk's `currentUser()` + email match when no row is found — `currentUser()` is a ~200–500ms Backend-API round-trip, so it must never sit on the hot path. Found-by-email rows get `clerk_user_id` backfilled. When a route genuinely needs `currentUser()` (e.g. `publicMetadata` on the homepage), run it inside `Promise.all` alongside the first DB query, never before it.
- **`page_content` reads are cached:** read config through `lib/page-content.ts` (`getPageContent(keys)` / `getPageContentValue(key)` / `getAllPageContent()`), never `supabaseAdmin.from('page_content')` directly — reads hit Next's data cache (tag `page-content`) instead of the DB on every request. The ONE writer, `PATCH /api/admin/page-content`, calls `revalidateTag('page-content', 'max')`; any new writer must do the same. (Admin editors always see fresh values — that route's GET reads the table directly.)
- **Query batching:** server components and API-route GETs batch independent Supabase queries with `Promise.all` (see `app/page.tsx`, `app/profile/page.tsx`, `/api/signup`, `/api/shift-signups`). Latency is dominated by round-trip count, not row volume — a new query should join an existing batch, not be awaited on its own line.
- **Server-rendered section data:** when a page's client components need API data on mount, extract the GET's assembly into a lib function and have the page fetch it server-side, passing it as an `initial*` prop (the component skips its mount fetch when the prop is present); the API route keeps serving the client's refresh path. Precedents: `lib/inbox.ts` (`/messages`), `lib/participate-data.ts` + `lib/resources.ts` `getMemberResourceView` (`/participate` — `SignupSection`, `GroupCommitments`, `ResourceCommitments`), `lib/admin-program-data.ts` (`/admin/program` — `ScheduleManager`, `LeadUpGatheringsManager`; also the assembly behind the schedule/rosters/shift-types/lead-up-events admin GETs), `lib/lead-up.ts` (`/schedule` — `LeadUpGatherings`; also `GET /api/lead-up-events`), and `/profile` (2026-08-27 — `ProfileDetails` gets `initialFields`/`initialValues`, `NotificationPreferences` gets `initialPrefs`, both computed in the page's existing batch; `/messages`' `MessagesInboxClient` now also guards its mount fetch on `initialConversations`). **Caveat — cross-tab registries:** if the `initial*` data is *authored on a different page* (e.g. shift types: authored on Configure, consumed by `ScheduleManager` on Program), the server-rendered prop can be stale — Next's router cache prefetches the consuming page before the edit happens. Such components must background-refetch on mount (and ideally again when the picker/modal opens) instead of skipping the fetch; the prop stays only the first paint.
- **Shared admin counts:** a population that Overview's stats and a Manage surface both display is a query, extracted once, both sides import — never two hand-rolled filters that can drift apart (the historical bug: Overview and Manage disagreeing about who holds a shift, docs/ux-review-log.md finding #1). `lib/shift-signups.ts` (`getShiftEventByUser`, `fetchShiftHolds`) is the shared shift-hold union; `lib/admin-counts.ts` (`getSuspendedClerkUserIds`, `isSuspended`) is the shared suspended-member set (migration 063). `lib/shift-hours-overview.ts`'s promised-hours ledger consumes both.
- **Images at display size:** member-uploaded images (avatars, lead-up gathering art) must render through `lib/supabase-image.ts` `supabaseResizedUrl(url, w, h)` — never the raw storage URL directly. **Transforms are opt-in since 2026-09-12** (`NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS=true`): Supabase's image transformation is a plan feature and the project's render/image endpoint currently answers `403 FeatureNotEnabled`, which rendered every avatar broken; without the flag the helper returns the original URL (avatars are upload-normalised to ≤1024px WebP, so this is fine; uploaded icon art at ~1MB is the cost). Set the flag once the feature is enabled on the Supabase project. Built-in `public/asset-library/` art ships at **≤320px** (`scripts/normalize-asset.js` `OUTPUT_WIDTH`); full-res masters live on the `design-exploration` branch. List/grid `<img>`s (members grid, inbox, threads, dashboard widgets) also carry `loading="lazy" decoding="async"`; the profile + member/admin detail portraits stay eager with `fetchPriority="high"` (they're the LCP). Uploaded icon art (the 1536×1024 PNG frame, ~1MB stored) renders through `iconDisplaySrc` (`components/IconImage.tsx`) — a 720×480 transform, same 3:2 aspect so cover crops nothing; `IconImage` applies it internally, and the two bespoke icon `<img>`s (Cabinet medals, AssetImagePicker tiles) call it directly.
- **Image upload defaults (2026-08-27):** every Storage `.upload()` sets `cacheControl: '31536000'` — safe because upload URLs are immutable (upsert routes append a `?v=` buster; the rest use unique timestamped paths). Without it Supabase defaults to `max-age=3600`, so browsers *and CDN edges* re-fetched hourly and cache-miss transform renders were the felt slowness. New upload routes must do the same. `/api/profile/avatar` additionally normalizes non-GIF uploads via `sharp` (EXIF-rotate → ≤1024px → WebP q82) so the stored object is ~100KB, not the camera original; GIFs pass through to keep animation.

Sign-out flow:
1. User clicks sign out
2. `GET /api/sign-out` revokes the user's Clerk sessions (verified identity only) and clears session cookies
3. `HeaderClient` clears localStorage on nav-auth confirmation

---

## Routing

```
/                        Public homepage (schedule, about) / Member dashboard (if approved)
/apply                   Application form (4 states, see Features doc)
/volunteer               Outside volunteer signup
/profile                 Logged-in member profile (designation, commitments, distinctions)
/participate             Participate page: role + shift pickers, Bring Something (resources), Your Groups (renamed from /signup 2026-07-02; /signup permanently redirects here via next.config.js)
/roles                   Registry of Roles — full departments + roles documentation, claimable in place
/members                 Member directory (approved members only)
/members/[id]            Individual member view
/messages                Member messaging inbox (DMs + group threads, filterable)
/messages/[userId]       Direct-message thread with a specific member
/messages/g/[groupId]    Group thread (members of that group only)
/schedule                Full public camp schedule (accessible to approved members)
/sign-in                 Clerk sign-in (catch-all route)
/sign-out                Sign-out redirect page
/admin                   Admin console — Community tab (role-gated; people + communication + logistics)
/admin/[id]              Admin view of a specific application
/admin/overview          Admin overview / stats
/admin/program           Admin Program tab — schedule + lead-up gatherings
/admin/configure         Admin Configure tab — forms, fields, recognition, structure, access
```

---

## API Routes

### Public / Member-facing

| Route | Method | Purpose |
|---|---|---|
| `/api/apply` | POST | Submit application |
| `/api/apply/file` | POST / GET | POST uploads an attachment for an admin-added **File upload** application field (multipart `file` → **private** `application-files` bucket under `{userId}/`, migration `072`; returns `{ url, name }` where `url` is a GET href to this route, not a storage URL). Type allow-list + magic-byte content check (`lib/file-sniff.ts` — the declared MIME is client-controlled; bytes must match it) + 10 MB cap + per-user quota (30 files / 100 MB). GET `?path=` is the only read path: **owner-or-admin**, then a 302 to a 60s signed URL (`lib/application-files.ts` rewrites pre-`072` public URLs stored in old answers to this route at render time). Upload gate is **any signed-in Clerk user** (not just applicants) and there's no cleanup path — see the gate note below the tables. |
| `/api/volunteer` | POST | Submit volunteer signup |
| `/api/signup` | GET/POST | Fetch departments/roles + upsert member **role** selection. Sets `role_approval_status = 'pending'` for roles with `requires_approval = true`. (Shift halves are legacy — shifts moved to `/api/shift-signups`.) |
| `/api/shift-signups` | GET/POST/DELETE | **Multi-shift signup** (shifts redesign): GET slots + owed hour requirements (incl. `lead_names`/`held_role`), POST sign up for a slot (signup-open enforced; capacity enforced **atomically** via the `claim_shift_signup` function, migration `073` — count + insert under one advisory lock, so concurrent signups can't oversubscribe; admin notified; optional `role: 'member'\|'lead'` — omitted keeps the existing role), DELETE cancel. Backed by `member_shift_signups` (the single source of shift holds since `065`). Gated on `getShiftParticipant` — **approved member or active volunteer** (2026-07-16; volunteers pick shifts self-serve). A volunteer's GET strips `owed` (member attunement concept); their admin bell note reads "… (volunteer)" with no application link. |
| `/api/groups/membership` | GET/POST | Self-service opt-in groups for the current member. GET lists groups whose **collection has `self_join` on** (migration `044`; no collection ⇒ not self-joinable) + the member's joined state, **grouped by collection** (each group carries `collection_id`/`collection_name`, ordered by collection `sort_order`); POST `{ group_id, joined }` joins (`source='application'`) or leaves (re-checks the same gate; **approved members only** — same gate as /participate). Separate from the apply form's `group_select` fields, from `show_on_profile` (profile display), and from group `visibility` (Find-a-group). Powers the **Your Groups** section on `/participate`. |
| `/api/resources` | GET | Shared resources, member view (`{ lists, pulse }`): **visible** lists (empty ones included — they're suggestion targets) with items, community claimed totals, the caller's own claim quantity (`mine`), **claimant names** (`claimants`, "You" first — the board's social proof), suggestion attribution (`offered_by_name`/`offered_by_me`), plus the **pulse** (contributors in the last 24h + latest claim within 48h, from `resource_claims.updated_at` — never stored). Powers the **Bring Something** board on `/participate`. |
| `/api/resources/claims` | POST | Set my claim on a resource: `{ resource_id, quantity }` — quantity ≥1 upserts the single per-member claim row (clamped 1–99), 0 removes it. Removing the last claim on **your own contribution** deletes its row too (retraction). Rejects items on hidden lists. **Approved members only.** |
| `/api/resources/lists` | POST | **Member-owned resources (2026-07-08).** Create a list: `{ title, description, show_on_dashboard? }` (goes live immediately; `show_on_dashboard` default false — opt-in to the home widget, migration `070`). **Approved, non-suspended members.** |
| `/api/resources/lists/[id]` | PATCH / DELETE | PATCH `{ title, description, show_on_dashboard }` edits a list — **wiki-open** to any approved member. DELETE removes the list (items + claims cascade) — **admin only** (the one destructive guardrail). |
| `/api/resources/items` | POST | Add an item: `{ list_id, name, note, quantity_needed?, bring? }`. Blank `quantity_needed` → open offer (NULL); else a tracked need (clamped 1–99). `offered_by` = caller; `bring` (default true) seeds the ×1 claim + fires the `contribution` radio moment. Visible lists only. **Approved, non-suspended members.** (Absorbed the former `/api/resources/offers`.) |
| `/api/resources/items/[id]` | PATCH / DELETE | Edit `{ name, note, quantity_needed }` or delete an item (claims cascade) — **wiki-open** to any approved member. |
| `/api/profile/application` | PATCH | Update profile fields |
| `/api/profile/fields` | GET/PATCH | The **Profile Fields registry** surface: GET returns the fields the member may see/edit (`page_content.config_profile_fields`) + their current values; PATCH writes `member_profiles.values` for `memberEditable` keys **only**, and records catch-up dismissals (`__dismiss`). Resolves via `resolveMember` (404 with no member row). Migration `037` |
| `/api/profile/notifications` | GET/PATCH | Read / upsert the caller's five email preferences (`notification_preferences`, keyed by `clerk_user_id`). Powers `/profile#notifications`. Any signed-in user — no member row required |
| `/api/profile/avatar` | POST | Upload avatar to Supabase Storage (normalized server-side: ≤1024px WebP via `sharp`, GIFs untouched; 1-year `cacheControl`; stale `avatar.*` siblings removed) |
| `/api/profile/cancel` | POST | Cancel own application (reason required; mirrors `cancelled` onto `members.status` and releases the member's role + shift slots — `camp_signups` and `member_shift_signups` — same cleanup as the admin remove flow) |
| `/api/profile/suspend` | POST | Suspend / resume own attendance: `{ suspended: boolean, note? }`. Suspending sets `members.suspended_at` and releases **all** commitments — role, groups, shifts, resource claims (`lib/suspension.ts`); resuming lifts the flag (nothing restored). Notifies admins. **Approved members only.** Migration `063` |
| `/api/admin/[id]/suspend` | POST | Admin suspend / resume a member (by application id): `{ suspended: boolean, note? }`. Same release/lift as the self-serve route via `lib/suspension.ts`. **Admin only.** Migration `063` |
| `/api/admin/dues/[memberId]` | POST | Admin mark camp dues paid / unpaid (by **row id**): `{ paid: boolean, note?, entity?: 'member'\|'volunteer' }`. `paid:true` confirms (sets `dues_paid_at` / `dues_paid_by` / `dues_note`); `paid:false` resets to owed (for members also clears `dues_reported_at`). `entity` routes to `members` (default) or `volunteers`. Powers the dues tracker (Community → Camp Dues) and the member-detail control; drives the `dues` attunement requirement. **Admin only.** Migrations `067`–`069` |
| `/api/dues/report` | POST | Member **self-report** dues paid: `{ reported: boolean }`. Sets/clears own `members.dues_reported_at` (no-op once an admin has confirmed `dues_paid_at`); reporting notifies admins (`dues_reported`). **Approved members only.** Migration `068` |
| `/api/role-suggestions` | POST | Submit a dept/role suggestion |
| `/api/radio` | POST | Member `voice` radio post (`{ message }` ≤280 chars). **Approved members only.** Backs the on-page `/radio` composer (`RadioComposer.tsx`) — **writing is open** since 2026-07-08 (reversing the 2026-07-03 broadcasters-only gate). Parses `@mention` (bell + email to the mentioned member) and `@here` (notify-all — bell + email to every member, post marked 📢, confirm-gated in the composer); mentioned members are reached once. Admin kill-switch: `config_radio.voice` ("Member voices"), which rejects with "Member posts are currently off". Feed reads are server-rendered (`/radio`, home teaser). See [radio.md](radio.md) |
| `/api/lead-up-events` | GET | Visible lead-up gatherings + RSVP counts + my own RSVP flag (`lib/lead-up.ts` `getMemberLeadUpEvents`) — the client refresh path for the server-rendered `/schedule` section. **Approved members only.** See [lead-up-gatherings.md](lead-up-gatherings.md) |
| `/api/lead-up-events/[id]/rsvp` | POST | RSVP to a gathering: `{ rsvp?: boolean }` (**omitted = toggle**). Writes `lead_up_event_rsvps`, returns `{ rsvped, count }`; a fresh RSVP sends the confirmation email. **Approved members only.** Migration `066` |
| `/api/schedule/[id]/rsvp` | GET/POST | RSVP to a visible at-camp event: GET `{ rsvped, count }`; POST `{ rsvp?: boolean }` (**omitted = toggle**) writes `event_rsvps`. No email. POST is approved-members-only; GET only requires a session. Migration `028` |
| `/api/polls/[id]/vote` | POST | Vote in a visible, unexpired poll: `{ option_indexes: number[] }` (or legacy `{ option_index }`). Replaces my own `poll_votes` rows (delete-then-insert); returns `{ counts, userVotes }`. Indexes are validated against the poll's options — an out-of-range index would inflate the counts array sent to every client. **Approved members only.** |
| `/api/shoutouts` | GET/POST | List visible shoutouts / post one (approved members) |
| `/api/shoutouts/[id]` | DELETE | Delete a shoutout (author or admin only) |
| `/api/notifications` | GET/PATCH | Fetch + mark-read user notifications |
| `/api/messages` | GET/POST | Inbox (direct + group conversations) / send a DM (**both sender and recipient must be approved members**). Backed by the conversations model (`lib/conversations.ts`); the inbox summary lives in `lib/inbox.ts`, shared with the server-rendered `/messages` page (the route is the client's refresh path). |
| `/api/messages/[userId]` | GET | Direct thread with a member (`lib/inbox.ts` `getDirectThreadMessages`, shared with the server-rendered thread page; the route is the client's poll path) |
| `/api/messages/[userId]/read` | POST | Mark a direct thread read (advances my `last_read_at`) |
| `/api/messages/g/[groupId]` | GET/POST | Group thread fetch / post (members-only). POST parses `@mentions` → in-app notification + throttled email. |
| `/api/messages/g/[groupId]/read` | POST | Mark a group thread read |
| `/api/messages/g/[groupId]/me` | PATCH | Set my per-thread prefs (`muted`, `email_opt_in`) |
| `/api/messages/unread` | GET | Unread count (direct + group, excludes muted) for the nav badge |
| `/api/groups/joinable` | GET | Open + listed groups I can self-join (Find-a-group picker) |
| `/api/groups/[id]/join` | POST | Self-join an open group |
| `/api/groups/[id]/leave` | POST | Leave an open group (admin-assigned groups → 403) |
| `/api/push/register` | POST/DELETE | Register (upsert by token) / unregister the calling member's push device token — called by the native app after notification permission and on sign-out |
| `/api/nav-auth` | GET | Lightweight auth check for nav (returns `isSignedIn`, `isApproved`, name, email, avatarUrl) |
| `/api/sign-out` | GET | Revoke Clerk sessions (verified identity) + clear session cookies |
| `/api/badge` | GET | Generate role badge PNG (OG image) |
| `/api/debug-auth` | GET | Echoes the **caller's own** `userId` / `sessionId` / `sessionClaims` / Clerk `publicMetadata`. Read-only and self-scoped (an unauthenticated caller gets nulls), but it is **not env-gated** and ships in production — a dev-only introspection helper with no reason to be live. |

**Gate notes (member-facing).** `/api/shift-signups` refuses suspended members (`suspended_at` → 403), but the **RSVP and poll-vote routes deliberately don't** — suspension releases commitments and blocks new ones, while RSVPs and votes stay open (read-access semantics; see `lib/suspension.ts`). Don't assume the shift-signup gate is universal. Note also that `/api/lead-up-events`, `/api/lead-up-events/[id]/rsvp` and `/api/schedule/[id]/rsvp` hand-roll their own `members.status = 'approved'` query instead of calling `getApprovedMember` — same semantics, but it's why they never see `suspended_at`. New member-facing routes should use `getApprovedMember`. Five pages did the worse version — a raw by-`clerk_user_id` status check with no email fallback (the three `/messages` pages against `applications`; `/schedule` and `/roles` against `members`) — until 2026-08-27; on localhost (dev Clerk instance vs the `059` prod-remapped ids) that bounced real members to `/profile`. All five now gate via `getApprovedMember` like everything else. (`/apply` + `/volunteer` keep their raw lookups deliberately — those check for *existing* rows to redirect already-members, and a localhost miss just shows the form.)

### Admin-only

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/[id]/approve` | POST | Approve application (sets status, in-app notification, approval email). Returns `emailWarning` when the email send fails so the admin UI can surface it — the approval itself still succeeds. |
| `/api/admin/[id]/reject` | POST | Reject application |
| `/api/admin/[id]/remove` | POST | Remove a member: `{ reason? }`. Soft-cancels the application (`status='cancelled'` + reason/timestamps), mirrors onto `members` (`setMemberStatus`), and releases every commitment — `camp_signups`, `member_shift_signups`, `group_members` (+ their group welcome notes). Bells + emails the member; returns `emailWarning` when that send fails (**the removal is already committed** — the warning is the only signal). |
| `/api/admin/departments` | GET/POST | List / create departments |
| `/api/admin/departments/[id]` | PATCH/DELETE | Update / delete department |
| `/api/admin/roles` | GET/POST | List / create roles |
| `/api/admin/roles/[id]` | PATCH/DELETE | Update / delete role |
| `/api/admin/groups` | GET/POST | List (with member counts) / create groups |
| `/api/admin/groups/[id]` | PATCH/DELETE | Update / delete group |
| `/api/admin/groups/[id]/members` | GET/POST/DELETE | Group roster / add member / remove member (`?clerk_user_id=`) |
| `/api/admin/groups/[id]/icon` | POST/DELETE | Upload / clear a group's icon image (`group-badges` bucket, `groups/` prefix; sets `groups.icon_image`). Mirrors the avatar route. |
| `/api/admin/group-collections` | GET/POST | List collections (by `sort_order`) / create one: `{ name, description?, selection?: 'single'\|'multi', show_on_profile?, self_join?, sort_order? }`. Migration `042`. |
| `/api/admin/group-collections/[id]` | PATCH/DELETE | Update a collection (same fields) / delete it — **refused (400) while any `groups.collection_id` still points at it**. |
| `/api/admin/lead-up-events` | GET/POST | List all gatherings + RSVP counts (`getAdminLeadUpEvents`) / create one (`{ title, description?, event_date?, start_time?, end_time?, location?, link?, host?, image_url?, visible? }`, appended to `sort_order`). See [lead-up-gatherings.md](lead-up-gatherings.md) |
| `/api/admin/lead-up-events/[id]` | PATCH/DELETE | Update (allow-listed fields + `sort_order`) / hard-delete a gathering |
| `/api/admin/lead-up-events/[id]/notify` | POST | Broadcast a **visible** gathering to every approved member: bell rows for all with a Clerk id + `sendLeadUpGatheringEmail` to everyone who hasn't set `email_announcements = false`; stamps `notified_at`. 400s if the gathering is hidden. **Re-sendable** (no dedupe ledger). Migration `040` |
| `/api/admin/lead-up-events/image` | POST/DELETE | Upload (multipart `image`; PNG/JPG/WebP, ≤5 MB → `lead-up-images` bucket, returns `{ url }`) / delete by `{ url }`. Migration `041` |
| `/api/admin/members/[memberId]/distinctions` | POST/DELETE | Grant a distinction by hand (`{ distinctionId, note? }` → `member_distinctions`; also posts an `achievement` radio moment linking the member) / revoke (`?distinctionId=`, no radio post). The manual half of the derived-distinctions model. Migration `038` |
| _(Shared Resources has no admin routes — member-owned on `/participate` since 2026-07-08; see the `/api/resources/*` rows above.)_ | | |
| `/api/admin/distinctions/[id]/icon` | POST | Upload distinction medal art (`group-badges` bucket, `distinctions/` prefix; returns URL, stored in `config_distinctions`). Used by the shared `AssetImagePicker`. |
| `/api/admin/departments/[id]/icon` | POST | Upload a department icon (`group-badges` bucket, `departments/` prefix; returns URL, stored in `departments.icon`). `[id]` is the row id or a client-generated key for not-yet-saved departments. |
| `/api/admin/schedule` | GET/POST | List / create schedule events |
| `/api/admin/schedule/[id]` | PATCH/DELETE | Update / delete event |
| `/api/admin/schedule/icon` | POST | Upload custom event icon |
| `/api/admin/schedule/rosters` | GET | Per-event shift rosters for the schedule editor (`member_shift_signups`; names + lead role, per occurrence) |
| `/api/admin/shift-types` | GET/POST | List / create shift types (the configurable registry — see [shifts-redesign.md](shifts-redesign.md)) |
| `/api/admin/shift-types/[id]` | PATCH/DELETE | Update / delete a shift type. Migration `046` |
| `/api/admin/signups/[userId]` | GET/PATCH | View / manage member signups |
| `/api/admin/role-requests` | GET | List pending role requests |
| `/api/admin/role-requests/[userId]` | PATCH | Approve / reject role request |
| `/api/admin/role-suggestions` | GET | List role suggestions |
| `/api/admin/role-suggestions/[id]` | PATCH | Approve / reject suggestion |
| `/api/admin/volunteer/[id]` | GET/PATCH | View / manage volunteer |
| `/api/admin/volunteer/[id]/approve` | POST | Approve volunteer |
| `/api/admin/notifications` | GET/PATCH/DELETE | Admin notification management |
| `/api/admin/notifications/[id]` | PATCH/DELETE | Per-notification actions |
| `/api/admin/announcements` | GET/POST | List visible announcements / create new |
| `/api/admin/announcements/all` | GET | List all announcements including hidden (admin only) |
| `/api/admin/announcements/[id]` | PATCH/DELETE | Update / delete announcement |
| `/api/admin/radio` | GET/POST | Recent radio posts (manager list, same assembly the Program tab server-renders) / post an organizer `broadcast` `{ message, detail?, icon?, notify? }` from the Admin console; optional `notify` = bell + announcement email (lead-up notify pattern). *(The `/radio` on-page composer targets `/api/radio`, not this route.)* See [radio.md](radio.md) |
| `/api/admin/radio/[id]` | DELETE | Remove a radio post (feed curation, any kind) |
| `/api/admin/page-content` | GET/PATCH | Read / upsert any `page_content` row — used for homepage copy (`home_*`) and form configs (`config_member_form`, `config_volunteer_form`) |
| `/api/admin/polls` | GET/POST | List all polls / create one (`{ question, options, visible?, allow_multiple?, expires_at? }`). **Gated by `requirePollManager`, not `requireAdmin`** — admins *or* members with Clerk `publicMetadata.canManagePolls`. The only admin-namespaced routes a non-admin can reach. |
| `/api/admin/polls/[id]` | PATCH/DELETE | Update / delete a poll. Also `requirePollManager`. |
| `/api/admin/set-admin` | POST | Grant / revoke admin: `{ targetUserId, grant: boolean }` → Clerk `publicMetadata.role = 'admin' \| null`. **Refuses self-demotion.** Takes effect on the target's next token refresh (~60s — the `requireAdmin` claim fast path). |
| `/api/admin/set-poll-manager` | POST | Grant / revoke the poll-manager capability: `{ targetUserId, grant: boolean }` → `publicMetadata.canManagePolls = true \| null` (shallow merge — preserves `role`). |
| `/api/admin/debug` | GET | Read-only dump of every `applications` row (`id, email, status, submitted_at`) + count + the raw Supabase error. Dev helper; **not env-gated**, but properly admin-gated. |
| `/api/admin/debug/reset-user` | POST | ⚠️ **Destructive dev helper.** `{ email }` → permanently deletes that user's `camp_signups`, `user_notifications`, `role_suggestions` and their `applications` row. No confirmation, no dry-run, not env-gated. Unlike `/api/admin/[id]/remove` it leaves `members` / `member_shift_signups` / `group_members` behind, so it can strand a member row whose application is gone. Prefer the remove route for real members. |

### Cron (Vercel Cron)

Scheduled jobs are declared in `vercel.json` (`crons`) and hit API routes under `/api/cron/*`. Vercel authenticates each invocation with `Authorization: Bearer ${CRON_SECRET}` — the `CRON_SECRET` env var must be set in Vercel (and `.env.local` for local testing); the routes fail closed without it. Cron schedules use **UTC**. Crons only run on the production deployment and activate on the next deploy after `vercel.json` changes.

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/attunement-nudges` | daily 16:00 UTC (9am PT) | Email approved members their outstanding attunement checklist (same `buildAttunementChecklist` as home/profile). Per-member cadence from `config_attunement_nudge_days` (Off/1/2/3/7 days, default 2; **Reminder emails** select in the Attunement Tasks manager) — the cron fires daily, each member is emailed only once their cadence cooldown lapses (`attunement_nudges` ledger). Also skips: attuned members, opt-outs (`notification_preferences.email_attunement_nudges`), no-email rows. Sends are spaced 600ms apart (Resend rate limit); `maxDuration = 60`. A logged-in **admin** can also GET the route in a browser: **dry-run by default** (JSON report of who'd get what), `?send=1` to really send. |
| `/api/cron/event-reminders?phase=morning_of` | daily 15:00 UTC (8am PT) | Remind approved members of the gatherings + shifts they have **today** (camp-local date). Batched — one email per member listing everything that day (`sendEventReminderEmail`). |
| `/api/cron/event-reminders?phase=day_before` | daily 02:00 UTC (7pm PT prev day) | Same, for **tomorrow**'s gatherings + shifts — the evening-before reminder. |

The two `event-reminders` entries share one route (`lib/event-reminders.ts` `collectEventReminders` gathers RSVP'd gatherings + held shift occurrences for the target camp-local date). Dedupe is the `event_reminders_sent` ledger (`clerk_user_id` × `target_date` × `phase`), **claimed before the send** (unique-violation = a concurrent run won; a failed send releases the claim), so a re-fire or overlap never double-sends; a failed opt-out lookup skips the phase (fail closed — never "email everyone anyway"); opt-out is `notification_preferences.email_event_reminders`; suspended/non-approved members are skipped; sends spaced 600ms; `maxDuration = 60`; **admin** GET dry-runs by default (`?send=1` to send). With no `?phase` the route runs **both** phases (a safe fallback if the query string is dropped). Camp timezone (`America/Vancouver`) is currently hardcoded — see generalizability log. **Vercel plan note:** this brings the project to **3 cron entries**; if the Vercel plan caps cron jobs below that, consolidate to a single no-`phase` daily entry (both reminders fire at one time) or upgrade. |

---

## Storage Buckets (Supabase)

See [database.md → Storage Buckets](database.md#storage-buckets) for the canonical list (`avatars`, `schedule-icons`, `application-files`, `group-badges`) and which migration creates each.

---

## Badge Generation

`/api/badge` is a Next.js OG image route (`next/og`, Node.js runtime) that composites role + department text over `public/badge_base.png`.

- Query params: `?role=` and `?dept=`.
- Role name renders one word per line; dept name wraps normally; font size auto-scales (`fitFontSize()`) to fit.
- Cached for a day (`max-age=86400`).
- Exact image dimensions, text-zone offsets, and the profile display transform live in the route + the profile/member layouts — read them there rather than trusting numbers copied here.

---

## Key Conventions

- **Shared `<Header />`** — all member-facing pages use the shared `Header` component (`components/Header.tsx` → `components/HeaderClient.tsx`). Pages no longer manage their own header rows.
- **Icon art & rendering** — every icon image (built-in asset library and uploads alike) lives on the standard normalized frame: artwork trimmed, scaled so its bounding-box *diagonal* is uniform, centered on a transparent 1536×1024 canvas (`lib/icon-image.ts` for uploads; `scripts/normalize-assets.py` / `scripts/strike-icon.py` for repo assets). Render icons only through `components/IconImage.tsx` (square clipping box, frame sized by height, `fill` = optical size) — never a raw `<img objectFit: contain>`, which shows the frame's margins and halves the art. Inside a **circular mask** (a border-radius'd `overflow: hidden` container or IconImage's `round`), use the exported `ROUND_FILL` (0.68): the art's half-diagonal is ~0.71·`fill` of the box, so any larger fill shaves icon corners against the circle. The Cabinet of Distinctions keeps its own 132% medal scale.
- **Mobile nav breakpoint** — detected in JS via `window.innerWidth < 768`. Below it, approved members get a fixed bottom tab bar (`components/MobileTabBar.tsx`, rendered by `HeaderClient` from the same `memberNavLinks` list as the desktop nav; hidden on `/admin` and for non-members) and the hamburger shrinks to overflow. The bar injects `body { padding-bottom }` incl. `env(safe-area-inset-bottom)` while mounted.
- **Notifications go through the seam** — every member-facing notification dispatches via `lib/notify.ts` (`dispatchMemberNotification`: member + kind + push payload + optional email thunk; one preference toggle gates all channels for a kind). Never call `send-email` senders directly from new feature code. Channels: email (Resend) + native push (`lib/push.ts`, FCM HTTP v1 — silent no-op until `FIREBASE_SERVICE_ACCOUNT` is set and devices register).
- **App compatibility (standing)** — the site runs inside the native app shell, so every member-facing change must hold up in a webview. Checklist in [mobile-companion.md](mobile-companion.md) → App compatibility.
- **`overflow-x: hidden`** on `html`/`body` to prevent mobile horizontal scroll
- **Camp signups join** — always fetch `applications` and `camp_signups` separately and join in JS; Supabase can't resolve the FK via nested select
- **Lazy Supabase client** — `lib/supabase.ts` uses Proxy to avoid build-time env var errors
- **Form config system** — `lib/form-config.ts` defines `MemberFormConfig` and `VolunteerFormConfig` types, default step/field definitions, and `mergeMemberConfig`/`mergeVolunteerConfig` helpers. Configs are fetched from `page_content` as JSON and merged with defaults on every request. The member merge **preserves the saved order of all sections** (built-in + custom — a custom section can be first), merges built-in field overrides (label, description, visible, required, width, options), keeps custom fields/elements as-is, and re-injects only missing *locked* core fields (deleted non-core fields stay deleted; "Reset to defaults" restores). Field types: text/textarea/radio/checkbox/file/agreement/group_select, plus divider & text-block elements. (`group_select` is member-form only — a checklist of Groups the applicant can opt into; the field's `options` hold the offered group ids, unset = all.) The Application Builder (`/admin/configure`) writes to `page_content` via `PATCH /api/admin/page-content`; saving is **manual** (dirty-tracking + explicit Save button / ⌘S; one PATCH flushes all dirty config keys). Only the open/closed toggles persist immediately.

---

## Multi-Community Architecture

> Roadmap: [multi-community.md](multi-community.md). Phase 1 design + branch sequence: [tenancy-design.md](tenancy-design.md).

The platform serves many communities from one codebase, one database, one deployment. Glåüm is community 1. **Branches 1a–1d (2026-09-11) completed Phase 1 tenancy**: every query behind `tenantDb`, community-scoped admin roles, hourly per-community crons, prefixed storage paths, per-community badge assets, the `/api/me/communities` picker, and migration 075 (community-scoped unique constraints). Still ahead: RLS as a second belt (1e), theme tokens (1f), and the second tenant's host/Clerk/sender setup.

### Roles (since 1d)

- **Community admin** = `members.role = 'admin'` in that community (`lib/admin-auth.ts`). `requireAdmin()` resolves the request's community itself (cached) and checks the caller's member row, so /api/admin routes and /admin pages call it unchanged; `requireCommunityAdmin(communityId)` when the caller already has it. Poll managers: `members.can_manage_polls` (`lib/poll-auth.ts`). Both set via `POST /api/admin/set-admin` / `set-poll-manager` (members row, not Clerk).
- **Platform owner** = Clerk `publicMetadata.platformRole === 'owner'` (Chanté): admin in every community, the only identity that may create communities; `requirePlatformOwner()`. Read from the session-token `metadata` claim when present, else the backend API.
- **`proxy.ts`** is a sign-in wall only for `/admin` + `/api/admin` (401 / sign-in redirect); the admin check happens in the handlers (every /api/admin route's gate is asserted by `scripts/check-route-auth.mjs`; every /admin page calls `requireAdmin()`).
- The nav's Admin link and the home/profile admin flags come from the member row (`NavAuthState.isAdmin`); the client never reads Clerk metadata for roles.

### Crons, storage, badge (since 1d)

- **Crons** sweep every active community. Two schedule modes: **hourly** (no params) gates each community on its local hour (`communities.timezone`, `lib/community-time.ts`; `settings` hours — nudges 9, reminders 8 / 19 by default); **daily with `?force=1[&phase=…]`** skips the gate and runs for all communities at fixed UTC times. **Vercel Hobby allows crons at most once a day, so `vercel.json` uses the daily entries at Glåüm's old times** (16:00 / 15:00 / 02:00 UTC); switching to the hourly entry is a one-line change once the project is on Pro (or a second community needs its own hours). An admin hitting a cron URL in the browser runs their own community only, hour gate bypassed, dry-run unless `?send=1`.
- **Storage**: new uploads are prefixed `<community_id>/` (`objectPath()`); see database.md → Storage Buckets.
- **Badge**: `/api/badge?c=<slug>&role=&dept=` — assets from `communities.theme.badge` (`base_url`, `font_url`, `width`, `height`) or the repo's Glåüm defaults; asset + render caches keyed by slug.
- **Picker + directory**: `GET /api/me/communities` (the person's memberships × communities, with each community's origin), the public `GET /api/communities` (discoverable communities: name, description, event, origin — `lib/community-directory.ts`), and `/communities` (memberships or a sign-in prompt, then "Find a community").
- **Demo community**: `scripts/seed-demo-community.mjs` (content: `scripts/seed-demo/content.mjs`) seeds *Lantern Hollow* as a second community by rows alone — the showcase/App Review tenant and the rehearsal for onboarding a real one. Service-role writes, every row stamped with the demo `community_id`; `--reset` wipes only that community's rows and avatar objects.

### Community resolution — `lib/community.ts`

- `getCommunity()` — server-only; resolves the current request's community from the host (`x-forwarded-host`, then `host`; `host:port` first, then bare hostname) against `communities.hosts`, falling back to `DEFAULT_COMMUNITY_SLUG` (env, default `glaum`) for localhost/preview/single-host. Throws `CommunityNotFoundError` only when neither resolves (the future platform-root picker handles that). The table is cached whole (`unstable_cache`, tag `communities`, 5-min revalidate); errors are never cached.
- Pre-migration safety: if the `communities` table is missing, a synthetic default (id `00000000-…`, name/event from `lib/site-config.ts`) is served with a one-time warning, so a mis-ordered deploy degrades instead of 500ing.
- `listCommunitiesForUser(clerkUserId)` — the person's memberships × communities; feeds `/api/me/communities` (branch 1d) for the app switcher / web picker.
- `app/layout.tsx` resolves once per request and mounts `<CommunityProvider>` (`components/CommunityProvider.tsx`); client components read `useCommunity()` (`id`, `slug`, `name`, `eventName`, `theme`) instead of build-time constants.

### Scoped data access — `lib/tenant-db.ts`

```ts
const community = await getCommunity()
const db = tenantDb(community.id)
await db.from('members').select('id').eq('clerk_user_id', userId) // + .eq('community_id', …) applied
await db.from('shoutouts').insert({ body, clerk_user_id })         // community_id stamped
```
`select`/`update`/`delete` on a scoped table are filtered by `community_id`; `insert`/`upsert` rows are stamped (and refused if they carry a different community). `GLOBAL_TABLES` (`communities`, `push_tokens`, `notification_preferences`) pass through. `rpc` and `storage` are exposed unscoped — pass the community explicitly; new uploads use `objectPath(communityId, relativePath)` (`${communityId}/…`; existing objects keep their paths).

**Second belt — RLS (1e, migration 076).** With `SUPABASE_JWT_SECRET` set, `tenantDb` talks to Postgres as the `authenticated` role using a per-community JWT minted in `lib/tenant-token.ts` (HS256 with the project JWT secret, or RS256/ES256 with an imported PEM key + `SUPABASE_JWT_KID`; 1h TTL, one cached client per community, re-minted 5 min before expiry). Row-level policies admit only rows whose `community_id` equals the token's claim, so a query that escaped the wrapper's filter returns nothing rather than another community's data. Unset → the service-role client, warned once (the pre-1e behaviour). Storage and `lib/community.ts` keep the service key. Leak test: `scripts/verify-tenant-isolation.mjs` (stranger token must read zero rows on every scoped table; anon reads nothing; the RPC is callable).

**Guard:** `npm run check` runs `scripts/check-tenant-scope.mjs`, which fails on any file under `app/`, `lib/`, `components/` importing `@/lib/supabase` (alias or relative). The allowlist (`scripts/tenant-scope-allowlist.txt`) emptied with branch 1c and must stay empty. Exempt by design: `lib/supabase.ts`, `lib/tenant-db.ts`, `lib/community.ts`.

**Lib convention (since 1c):** every exported lib function that queries takes `communityId: string` FIRST (`getMemberGroups(communityId, clerkUserId)`, `getInboxConversations(communityId, userId)`, `getRadioFeed(communityId, limit)`, …); pure helpers keep their shape. Pages and route handlers resolve `const community = await getCommunity()` once, right after the auth gate, and pass `community.id` down (or `community` itself to email/notify).

### Community-scoped lib signatures (since 1b)

Every identity/config/notification helper takes the community first:
`resolveMember(communityId, clerkUserId, email?)`, `resolveMemberForUser(communityId, clerkUserId)`, `getApprovedMember(communityId, clerkUserId)`, `getShiftParticipant(communityId, clerkUserId)`, `upsertMember(communityId, …)`, `setMemberStatus(communityId, …)` (`lib/members.ts`); `getOwnedApplication(communityId, userId, email)`; `memberDisplayNames(communityId, ids)`; `suspendMember(communityId, …)` / `liftSuspension(communityId, member)`; `getDuesRoster(communityId, audience)`; `getPageContent(communityId, keys)` / `getPageContentValue` / `getAllPageContent(communityId)`; `notifyAdmin(community, input)`; every sender in `lib/send-email.ts` takes `community` (whole object) — `sendUserEmail(community, to, subject, html)`, typed senders carry `community` in their opts — and builds links from `appOrigin(community)` (first non-localhost host, else `NEXT_PUBLIC_SITE_URL`), sender from `community.emailFrom ?? RESEND_FROM`, wordmark/footer/subjects from `community.name`. `lib/notification-prefs.ts` and `lib/push.ts` use `globalDb()` (person-level tables). The site name/event name in the root layout metadata, the manifest and the install prompt come from the community row (`generateMetadata`, async `manifest()`, `useCommunity()`).

### Configurable content — `page_content` table

`page_content` is the per-community content/config store (community-scoped since `074`; PK becomes `(community_id, key)` in `075`). Read it through `lib/page-content.ts` — `getPageContent(communityId, keys)` etc., cached per community under tag `page-content:<communityId>` (`pageContentTag(communityId)`; the PATCH writer revalidates that tag) — never directly. Before hardcoding a string in source, ask whether it belongs here. Currently configurable: homepage copy (`home_*`), form configs (`config_member_form`, …), agreement items, attendance options, and every `config_*` key listed in [database.md](database.md).

### Community identity — `lib/site-config.ts` (retired as identity source, 1b)

`SITE_NAME` / `EVENT_NAME` / `SITE_DESCRIPTION` survive only as the synthetic-fallback values in `lib/community.ts` (pre-migration safety net) and inside `DEFAULT_TRACK_COPY`. Feature code reads `community.name` / `community.eventName` / `community.description` from `getCommunity()` (server) or `useCommunity()` (client). Never hardcode `"Glåüm"`; never import the SITE_* constants in new code.

### Platform host, Clerk satellites, sender (2026-09-12 — `docs/domains.md`)

- **Platform host** (`PLATFORM_HOSTS`, e.g. `withmanyhands.ca`): resolves to the pseudo-community `platform` (`lib/community.ts`); `proxy.ts` rewrites `/` to `/communities` and redirects every community page there; only the picker, the auth pages, `/api/nav-auth`, `/api/me/*` and the manifest answer. Unset → no platform host (an unknown host still falls back to `DEFAULT_COMMUNITY_SLUG`).
- **Clerk**: communities are **subdomains of the platform domain** (decision 2026-09-12), which share Clerk's session with no extra setup beyond the dashboard's Allowed Subdomains list. Dormant, for a future client on its own root domain: multi-domain (`CLERK_PRIMARY_HOST`; unset today): `lib/platform.ts` `clerkDomainConfig(host)` — the primary and any local host run Clerk normally; every other host is a **satellite** (paid Clerk plan) (`proxy.ts` options callback + `ClerkProvider` props), so sign-in bounces to the primary's `/sign-in` and returns. The sign-in/sign-up pages accept `redirect_url` targets on the current origin or any **known** origin (`isKnownOrigin`: platform hosts + every `communities.hosts` entry) and nothing else.
- **Origins**: `resolveSiteOrigin` now prefers the **request host**; `NEXT_PUBLIC_SITE_URL` is only the local/preview fallback (one deployment, many hosts).
- **Sender**: `PLATFORM_EMAIL_FROM` → `RESEND_FROM` → sandbox; a community overrides with `communities.email_from`.

### Still single-community
- **Direct `page_content` reads** in a few files (`app/admin/page.tsx`, `app/admin/[id]/page.tsx`, `app/api/admin/schedule/[id]/route.ts`, `lib/attunement-nudge.ts`) go through `db` (scoped) but bypass the cached reader — genlog row 2026-09-11.
- **RLS** (1e) is built; it is live only once `SUPABASE_JWT_SECRET` is set in Vercel (after 076 + the leak test).
- **Theme tokens** (1f) are built: every UI colour is a `:root` custom property (`lib/theme.ts` ↔ `app/globals.css`), and `communities.theme.colors` / `.fonts.display` override them via a `<style>` the root layout injects. Not yet themeable: email HTML, the badge art/font (those come from `theme.badge`), the manifest/theme-color meta, Clerk's auth cards, and the schedule palette.
