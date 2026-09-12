# Domains, Clerk & email — the platform host and every community host

**Status: runbook written 2026-09-12 with the code side built (branch `feat/platform-domain`);
the dashboard/DNS steps below are Chanté's to execute, in order.** Platform domain:
**withmanyhands.ca** (registered 2026-09-12).

## The shape

| Host | What it is | Resolves to |
|---|---|---|
| `withmanyhands.ca`, `www.withmanyhands.ca` | **Platform host** — the picker (`/communities`) and the auth pages. Nothing else. | `PLATFORM_HOSTS` env → the pseudo-community `platform` (`lib/community.ts`); `proxy.ts` rewrites `/` to the picker and redirects community pages there |
| `camp.glaum.ca` | Glåüm (community 1) | `communities.hosts` |
| `demo.withmanyhands.ca` | Lantern Hollow, the demo (`scripts/seed-demo-community.mjs`) | `communities.hosts` (already added) |
| `<anything>.withmanyhands.ca` or a client's own domain | a future community | its `communities.hosts` row |

One Vercel project serves all of them; one Clerk production instance signs everyone in; one
Supabase database holds every community. Adding a community host is a row + a Vercel domain +
a Clerk satellite + DNS — no deploy.

## Env vars (Vercel → production; `.env.local` for local runs)

| Var | Value | Effect when unset |
|---|---|---|
| `PLATFORM_HOSTS` | `withmanyhands.ca,www.withmanyhands.ca` | no platform host: every host resolves to a community (today's behaviour) |
| `CLERK_PRIMARY_HOST` | `withmanyhands.ca` (defaults to the first `PLATFORM_HOSTS` entry) | no satellites: Clerk runs single-domain everywhere |
| `PLATFORM_NAME` | `Many Hands` (default) | — |
| `PLATFORM_EMAIL_FROM` | `Many Hands <hello@withmanyhands.ca>` (after Resend verifies the domain) | falls back to `RESEND_FROM` (Glåüm's sender) |
| `NEXT_PUBLIC_SITE_URL` | keep as is | since 2026-09-12 the **request host wins** for redirects/links; this is only the fallback for local/preview hosts |

All four are safe to set before the DNS/Clerk work lands — the code degrades to single-domain
behaviour on hosts it doesn't recognise.

## Order of operations

### 1. Vercel — add the domains (no downtime)
Project → Settings → Domains: add `withmanyhands.ca`, `www.withmanyhands.ca` (redirect www →
apex, or the reverse — pick one), `demo.withmanyhands.ca`. Vercel shows the DNS records: apex
`A 76.76.21.21` (or the ALIAS/ANAME your registrar supports), subdomains `CNAME
cname.vercel-dns.com`. Add them at the registrar; wait for Vercel to show ✓.

### 2. Env — `PLATFORM_HOSTS` (and `PLATFORM_NAME`) in Vercel, redeploy
Now `https://withmanyhands.ca/` is the picker (signed out → sign-in), `demo.withmanyhands.ca`
is Lantern Hollow. **Sign-in will not yet work on the new hosts** — Clerk's production instance
only trusts its primary domain — which is step 3.

### 3. Clerk — primary domain + satellites (the one step with a user-visible moment)
Decision (tenancy-design.md decision #2): **`withmanyhands.ca` becomes the Clerk primary**;
`camp.glaum.ca` and every community host become **satellites**. Reason: sign-in pages live on
the primary, and the platform host is the one host every future community shares.

Clerk Dashboard → *production instance* → **Domains**:
1. Change the primary domain to `withmanyhands.ca`. Clerk lists new DNS records (the
   `clerk.withmanyhands.ca` / `accounts.withmanyhands.ca` CNAMEs and the email records); add
   them at the registrar; wait for Clerk to verify. Existing sessions on `camp.glaum.ca` will
   need a fresh sign-in once the switch happens (sessions are cookie-bound to the primary).
2. Add satellite domains: `camp.glaum.ca`, `demo.withmanyhands.ca`. Clerk shows any records a
   satellite needs; add them.
3. In Vercel set `CLERK_PRIMARY_HOST=withmanyhands.ca` and redeploy. `proxy.ts` and
   `app/layout.tsx` now run Clerk as a satellite on every non-primary, non-local host: a
   sign-in on `demo.withmanyhands.ca` bounces to `withmanyhands.ca/sign-in` and back. The
   sign-in/sign-up pages accept a `redirect_url` on any **known** host (platform hosts +
   `communities.hosts`) and nothing else.
4. Also update the Clerk-side allowed origins / redirect URLs if the dashboard lists them
   (Paths / Redirects) to include the new hosts.

Local development is unaffected: the dev instance keeps running single-domain on `localhost`,
`127.0.0.1` and `*.localhost` (`lib/platform.ts` treats them as local, never satellites).

### 4. Resend — the platform sender
Resend → Domains → add `withmanyhands.ca` → add the DKIM/SPF records → verified. Then in Vercel
`PLATFORM_EMAIL_FROM=Many Hands <hello@withmanyhands.ca>`. Glåüm keeps its own sender by
setting `communities.email_from` to today's `RESEND_FROM` value (one SQL update), so the
`RESEND_FROM` env can eventually go. The demo sends from the platform address.

### 5. Verify
- `https://withmanyhands.ca/` → sign-in → picker lists your communities (Glåüm, Lantern Hollow).
- `https://demo.withmanyhands.ca/` → Lantern Hollow in its theme; Sign in → bounce to the
  platform host → back to the demo, signed in; admin console opens (your organizer row).
- `https://camp.glaum.ca/` → unchanged for members; sign-in round-trips through the platform.
- An unknown `redirect_url` on `/sign-in` (e.g. `https://evil.example`) lands on home instead.
- Emails from the demo carry the platform sender; Glåüm's still carry its own.

## What this does NOT do yet
- Route `withmanyhands.ca` to a marketing/landing page — the picker is the whole platform host
  today (business.md → Showcase ladder rung 3 is the landing page, its own repo).
- Automate satellite/DNS setup for a new community (level A setup task, by hand for now).
- Per-community custom domains for *deep links in the native app* — the app should use each
  community's first host (`appOrigin`); universal links per custom domain are a later concern
  (mobile-companion.md → App Store path).
