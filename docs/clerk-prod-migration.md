# Clerk dev → production migration

**Status: executed (migration 059 applied); kept for provenance. Since 2026-09-12 the production instance's primary domain is `withmanyhands.ca` and Glåüm lives at `glaum.withmanyhands.ca` — see `docs/domains.md`.** At the time of writing the live site (camp.glaum.ca)
runs on the Clerk **dev instance** (`sweet-lionfish-23.clerk.accounts.dev`) —
all ~21 member accounts and every stored `clerk_user_id` belong to it. The
production instance (DNS + settings configured) has **0 users**. Swapping keys
without migrating would orphan every member's data.

## Why user IDs must be remapped

Clerk user IDs are per-instance. The app joins everything on `clerk_user_id`
(no FKs) — applications, members, signups, shifts, groups, messages,
conversations, shoutouts, votes, RSVPs, claims, notifications, distinction
grants, resource offers, plus the derived `conversations.direct_key`. New
prod accounts get new IDs, so every stored ID must be rewritten old → new.

## Key layout (durable)

| Where | Keys | Instance |
|---|---|---|
| `.env.local` | `pk_test_…` / `CLERK_SECRET_KEY=sk_test_…` | dev — prod keys don't work on localhost |
| `.env.local` | `CLERK_SECRET_KEY_PROD=sk_live_…` | prod — used only by the migration script |
| Vercel (production env) | `pk_live_…` / `sk_live_…` | prod — set during cutover below |

After cutover, local sign-ins hit the dev instance while the shared Supabase
holds prod IDs. The `resolveMemberForUser` email fallback covers reads and its
backfill only fills NULL, so it can't overwrite prod IDs. Avoid doing real
member *writes* (messages, signups) from localhost; use a test account.

## Cutover sequence (~15 quiet minutes)

1. **Dry run** — `node scripts/migrate-clerk-to-prod.mjs` prints an aggregate
   plan and writes the full mapping (with emails) to
   `scripts/clerk-id-map.json` (gitignored). Review it.
2. **Execute** — `node scripts/migrate-clerk-to-prod.mjs --execute` creates the
   prod users (email, name, `publicMetadata` — admin role and poll managers
   carry over; idempotent, matches by primary email) and generates
   `supabase-migrations/059_clerk_prod_remap.sql`.
3. **Verify the session-token claim** exists on the **prod** instance:
   Dashboard → prod instance → Sessions → Customize session token →
   `{"metadata": "{{user.public_metadata}}"}`.
4. **Apply `059_clerk_prod_remap.sql`** in the Supabase SQL editor. Its
   verification block prints per-column counts of un-remapped rows — all 0
   before `COMMIT`. Not destructive (pure ID rewrite); re-runnable.
5. **Swap Vercel env** (production): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` →
   `pk_live_…`, `CLERK_SECRET_KEY` → `sk_live_…`. Redeploy (publishable key is
   build-time).
6. **Sign in** on camp.glaum.ca with your email code — same email, same
   account data, admin tabs present. Spot-check a member profile, messages,
   and shifts.

Members' next visit asks them to sign in again (same email, code arrives, all
their data intact). Passwords don't carry over — anyone who used one signs in
with the email code and may set a new password afterwards.

## Notes

- Steps 1–2 any time; steps 4–5 back-to-back in a quiet window (rows written
  by the still-dev site between the SQL and the swap would keep dev IDs; the
  SQL is re-runnable to catch stragglers, or just pick a quiet moment).
- Dev users without an email cannot be migrated (script warns; none expected).
- Deleted/cancelled users' IDs may linger in old messages: unmapped IDs pass
  through untouched — same dangling behavior as today, harmless.
