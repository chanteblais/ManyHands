# Multi-Community Roadmap

This document tracks the evolution of the Glåüm camp platform toward a **reusable service** that can support many communities — camps, retreats, festivals, volunteer groups, and intentional communities — while each community retains its own identity, terminology, and workflows.

Glåüm is the first community on the platform.

> **Living ledger:** [`generalizability-log.md`](./generalizability-log.md) is the append-as-you-go record of every Glåüm/What-If–specific or single-community assumption found while building/dogfooding. It is maintained automatically during iterations and is the concrete requirements source for the Phase 1 foundation below. Build the foundation *after* What If (July 23, 2026), informed by that log + real test-user needs.

> **Sibling track:** [`mobile-companion.md`](./mobile-companion.md) — the future mobile app is "just another client" of the same backend. It needs the same foundation this roadmap builds (API boundary, server-side logic, config over hardcoding); there is no separate mobile workstream.
> *2026-09-11:* the App Store publication path (`mobile-companion.md` → App Store path; `business.md` → discussion log 2026-09-11) makes Phase 1 tenancy the gating work: the shared app cannot show a community picker until the web is multi-tenant. Two interested communities now exist — the "second use case" this roadmap waited for. Decided the same day: tenancy is built *before* the app shell, and the App Store listing goes up as Many Hands with Glåüm as tenant 1 (a second tenant is not a gate).

> **Commercial track:** [`business.md`](./business.md) — the living record of the business-launch conversation: mission/success tiers, the seasonality analysis, market segments beyond burn camps, and pricing directions. This roadmap answers *how* the platform generalizes; that doc answers *for whom and on what terms*.

---

## Guiding principles

- **Don't abstract without a second use case.** Generalise when there are two real communities to validate against, not before.
- **Use the existing patterns first.** `page_content`, `lib/site-config.ts`, and the form-config system can carry a lot before multi-tenancy is needed.
- **Preserve all current Glåüm functionality.** Every change should be invisible to existing members.
- **Simplicity over theoretical scalability.** Three similar configurations are fine; a premature abstraction is worse.

---

## Delivery model — bespoke feel, SaaS chassis (direction logged 2026-09-04, work not started)

The commercial framing shifted (see [`business.md`](./business.md) → discussion log 2026-09-04):
the platform — Chanté now calls it **Many Hands** (working name) — would initially be sold as a
**done-for-you / productized service**, with Chanté setting up each community's hub. That changes
nothing about this roadmap's destination and raises its stakes: each client hub must *feel* like
a custom website (branding, colours, logo, domain, terminology, navigation, profile fields,
categories, groups, roles, applications, schedules, resources, distinctions, permissions, feature
toggles) while *being* a tenant/configuration of the one platform. **One codebase, one
generalized data model, one backend/API layer, one shared deployment architecture, many highly
customized community instances. Never clone the codebase per client.**

### Three levels of customization

| Level | What it is | Cost posture |
|---|---|---|
| **A — Configuration** | Already-supported capabilities: labels, profile fields, categories, colours, roles, navigation, feature toggles, permissions, content | Cheap/easy — this is the setup service |
| **B — Platform extension** | Client needs something the platform can't do yet, but the underlying need generalizes | Higher fee; client part-funds platform R&D |
| **C — True bespoke** | No sensible generalized abstraction exists | Rare, expensive, possibly web-only or declined |

**Platform-extension protocol (level B):** never one-shot a client-specific feature. Instead:
(1) understand their actual workflow/problem → (2) identify the generalized primitive underneath
→ (3) build that capability into the platform → (4) configure it for the original client →
(5) it's available to every future community. Example: "supervision-hour tracking" for a
counselling org is built as a generalized **participation/hours-tracking module** (configurable
activity types, approval, totals, member visibility, reporting, permissions) that later serves
volunteer/practicum/service/training hours.

**The guiding philosophy: clients describe the problem; the platform decides the abstraction.**
"Who completed orientation before signing up for certain shifts" → *conditional eligibility based
on member attributes*, not an "orientation shift approval" feature. Every capability added this
way should strengthen the platform's conceptual coherence.

**The anti-pattern to refuse: per-client conditionals.** No `if community == X` branches in
platform code, ever — that's how the platform becomes a pile of exceptions. When a request seems
one-off ("rotating 3D llama on our homepage"), ask what the reusable abstraction is (custom
interactive content block? embed block? custom page module?). If a sensible generalized component
exists, build that; if not, the request is web-only, true-bespoke, or declined.

**The native-app constraint** (see [`mobile-companion.md`](./mobile-companion.md) → One shared
app): the shared mobile app can only render capabilities it knows how to render. Generalized
platform features appear in the app; tenant configuration can vary its rendering dramatically;
arbitrary custom client code cannot. Escape hatches for rare one-offs — web-only functionality,
a generic embedded/webview page, custom content blocks — exist but must not replace proper
generalized design. Practically: every level-B extension should be designed as a primitive the
app can render from config.

### Questions to work when this starts (parked, from the 2026-09-04 session)

How tenant configuration is structured · data-driven vs code-driven boundaries · feature
flags/modules design · preserving native-app compatibility · custom domains + branding ·
the config-vs-extension boundary (and pricing the levels) · preventing client-specific technical
debt · the bespoke→primitive evolution path · onboarding tooling fast enough that **a typical
community launches in roughly a day** on the existing generalized foundation (the seed-script /
starter-template work in `business.md` → Showcase is the head start on this).

---

## What each community will eventually be able to configure

- Name, tagline, logo, hero imagery
- Brand colors and typography
- Application form questions, steps, and agreement text
- Role departments and role names
- Schedule structure and event categories
- Terminology (what this platform calls "attunement", "shifts", "groups", etc.)
- Member-facing copy throughout the site
- Badge design and font

---

## Phase 0 — Completed

Lowest-risk changes that establish correct patterns without requiring a second community.

### Done

**`lib/site-config.ts`** — new file. Community identity driven by env vars:
- `NEXT_PUBLIC_SITE_NAME` (default: `"Glåüm"`)
- `NEXT_PUBLIC_EVENT_NAME` (default: `"What If 2026"`)
- `NEXT_PUBLIC_SITE_DESCRIPTION`

Also exports default fallbacks for configurable option lists:
- `DEFAULT_AGREEMENT_ITEMS` — agreement checkbox items (overridable via `page_content` key `member_acknowledgements`)
- `DEFAULT_ATTENDANCE_OPTIONS` — attendance radio options (overridable via `page_content` key `member_attendance_options`)
- `DEFAULT_MEMBERSHIP_TYPE_OPTIONS` — membership type dropdown options

**`app/layout.tsx`** — site metadata now reads from site-config env vars instead of hardcoded strings.

**`tailwind.config.ts`** — color token namespace renamed `glaum.*` → `brand.*`.

**Migration 025** — five community-specific `applications` columns renamed to generic equivalents:

| Old name | New name |
|---|---|
| `glaum_acceptance` | `community_acceptance` |
| `attunement_status` | `onboarding_status` |
| `attunement_status_other` | `onboarding_status_other` |
| `draws_to_glaum` | `draws_to_community` |
| `camp_relationship` | `membership_type` |

All TypeScript references updated to match across: `lib/form-config.ts`, `lib/application-options.ts`, `app/api/apply/route.ts`, `app/apply/ApplyWizard.tsx`, `app/apply/page.tsx`, `app/profile/ProfileSettings.tsx`, `app/admin/OverviewSection.tsx`, `app/admin/page.tsx`, `app/admin/[id]/page.tsx`.

**Configurable content via `page_content`** — agreement items and attendance options now flow from `page_content` with fallback to constants. `apply/page.tsx` fetches and passes them to `ApplyWizard` as props.

### Still uses Glåüm-specific content (intentionally left for Phase 1+)

- Terminology: "Attunement", "Many Hands", step subtitles in the form wizard
- The final "Shrimp" question step (`shrimp_relationship` DB column) — will move to `custom_answers` in a future migration
- Badge design: `TokyoDreams` font + `badge_base.png` base image
- All public-facing copy (homepage, about, participate) — already in `page_content`, editable by admins
- `DEPT_OPTIONS` list in `ApplyWizard.tsx` — department interest checkboxes; these should come from the `departments` table (or a `page_content` key) rather than being hardcoded

---

## Phase 1 — When a second community joins

> **Superseded 2026-09-11 by [`tenancy-design.md`](./tenancy-design.md)** — the full Phase 1
> design (data model, request context, scoped client, DB roles, storage, crons, six-branch
> sequence, verification), drafted from a complete code inventory now that two interested
> communities exist. The sketch below is kept as history; where they differ, the design doc wins.

These changes require a real second community to validate design decisions. Do not implement speculatively.

### Database

Add a `communities` table:
```sql
CREATE TABLE communities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,       -- URL-safe identifier (e.g. 'glaum', 'wildwood')
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Add `community_id UUID FK → communities.id` to:
- `applications`
- `volunteers`
- `departments`
- `roles`
- `schedule_events`
- `camp_signups`
- `announcements`
- `polls`
- `page_content`
- `messages`

Row-level security policies filter by `community_id` on every query.

### Community config table

Store branding and terminology per community instead of env vars:
```sql
CREATE TABLE community_config (
  community_id UUID FK → communities.id,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (community_id, key)
);
```

Keys: `site_name`, `event_name`, `badge_font_url`, `badge_base_url`, `brand_color_gold`, `brand_color_purple`, `brand_color_ink`, `term_onboarding` (what Glåüm calls "Attunement"), `term_membership_unit` (what Glåüm calls a "shift"), etc.

### Auth

Evaluate Clerk Organizations for community-scoped admin roles. Alternatively: add `community_id` to `publicMetadata` and verify it in admin middleware.

### Badge

Make `/api/badge` community-aware: load font and base image from community config URLs rather than local filesystem paths.

### Storage

Prefix Supabase Storage paths with `community_id/` to namespace uploads per community.

---

## Phase 2 — At scale

- Per-community custom domains (Vercel rewrites or separate deployments)
- Community-level theming via CSS custom properties injected at the layout level
- Self-service community onboarding (admin UI to create and configure a new community)
- Community admin roles separate from platform super-admin

---

## Hardcoded things to watch

When adding new features, avoid introducing new hardcoded community-specific values. Common failure modes:

| Pattern to avoid | Pattern to use instead |
|---|---|
| String literal `"Glåüm"` in UI | `SITE_NAME` from `lib/site-config.ts` |
| String literal `"What If 2026"` | `EVENT_NAME` from `lib/site-config.ts` |
| Hardcoded option list in a form | JSON in `page_content` with fallback constant |
| Hardcoded copy in a component | Key in `page_content` fetched at render time |
| Community-specific field names in DB schema | Generic names; community-specific labels in form-config |
| New DB column with culture-specific meaning | Consider `custom_answers JSONB` instead |

---

## Field evidence — the All Hands extraction (2026-08-26)

The catering kitchen board was extracted into its own product repo (**All
Hands**, `~/Projects/all-hands`), then restyled from its own paper-toned look
into the full camp visual language. That is the closest thing to a dry run of
"stand up a second product on this platform's DNA" we have, and it produced
concrete evidence for several of this doc's bets — worth consulting before
designing the Phase 1 foundation:

1. **Token-layer theming works, and is cheap — when it exists.** The board's
   stylesheet was CSS-custom-property-driven, and swapping its ~15 tokens
   (plus targeted rules) re-skinned every surface in one pass; a headless
   harness proved the change presentation-only (identical shopping-list
   output before/after). This is the strongest evidence yet for Phase 2's
   "theming via CSS custom properties injected at the layout" — and it
   sharpens the cost of this app's inline-hex debt (genlog 2026-06-30): the
   camp app can't have that one-pass swap until colors go through tokens.
2. **A written design system is an installable theme.** The camp look
   transplanted to a foreign page in a single session because
   `design-system.md` + `globals.css` record exact tokens, shadows, fonts,
   and motifs. For multi-tenant theming, the doc layer isn't documentation
   overhead — it is the packaging of the theme itself.
3. **Blast-radius-shaped modules extract cleanly; interwoven ones won't.**
   The board came out in a day because it had one page, two routes, one
   storage key, and storage behind one seam — the "quarantine" that was a
   security posture turned out to be an extraction seam. Corollary for the
   foundation: features whose seams are narrow (own routes, own keys, no
   cross-imports) stay portable; members/profiles/groups-shaped features
   will never extract like this and must be generalized in place.
4. **Schema-compatible seams make migration a row copy.** All Hands kept the
   `page_content` key/value shape, so moving the live board is one copied
   row. Generic storage primitives shared across products keep future moves
   (per-community exports, spin-outs) boring.
5. **The working conventions are platform assets.** The docs flow
   (docs-before-commit, generalizability log, QA/UX logs), the pre-commit
   crossed-session guard, and the session brief transplanted wholesale into
   the new repo in hours — with one upgrade worth back-porting: All Hands
   uses a root `CLAUDE.md` as the auto-loaded session brief instead of this
   repo's paste-in `docs/session-prompt.md`. (Back-ported 2026-08-27 — this
   repo's brief now lives at root `CLAUDE.md` too.)
6. **Every surface needs an identity story or an explicit expiry.** The
   board's accepted-risk unauthenticated posture was fine festival-scoped
   *because the acceptance and the retire-or-gate expiry were written down*
   — and it still became the new product's founding constraint the moment
   the probe became a product. Platform rule of thumb: no new surface
   without either an auth story or a dated retirement clause.
7. **Behavior-identity harnesses de-risk config swaps.** The pattern of
   running a surface headlessly against real state and diffing its outputs
   (All Hands `scripts/verify-quantities.mjs`) generalizes: any future
   "swap the theme / config / tenant" change should be provable as
   presentation-only the same way.
