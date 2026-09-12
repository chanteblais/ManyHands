# Domains, Clerk & email — the platform host and every community host

**Status: LIVE 2026-09-12.** Steps 1–4 done: the platform host, Glåüm on
`glaum.withmanyhands.ca` (row cut over; `camp.glaum.ca` no longer resolves to a community) and the
demo are all serving on `withmanyhands.ca` with Clerk's primary domain moved. Remaining: remove
`camp.glaum.ca` from the Vercel project when convenient, and step 5 (Resend + `PLATFORM_EMAIL_FROM`). Platform domain:
**withmanyhands.ca** (registered 2026-09-12). **Decision 2026-09-12 (option 1):** every
community lives on a **subdomain of withmanyhands.ca** — Glåüm moves from `camp.glaum.ca` to
`glaum.withmanyhands.ca` (no redirect kept; the old domain is simply dropped). Reason: Clerk
shares the session across subdomains of its primary domain for free, while a community on its
own root domain needs a Clerk *satellite domain* (paid plan). Custom domains for paying clients
are the deferred option 2 at the end of this doc.

## The shape

| Host | What it is | Resolves to |
|---|---|---|
| `withmanyhands.ca`, `www.withmanyhands.ca` | **Platform host** — the picker (`/communities`) and the auth pages. Nothing else. | `PLATFORM_HOSTS` env → the pseudo-community `platform` (`lib/community.ts`); `proxy.ts` rewrites `/` to the picker and redirects community pages there |
| `glaum.withmanyhands.ca` | Glåüm (community 1) | `communities.hosts` (cut over 2026-09-12; the old `camp.glaum.ca` was dropped without a redirect) |
| `demo.withmanyhands.ca` | Lantern Hollow, the demo (`scripts/seed-demo-community.mjs`) | `communities.hosts` |
| `<slug>.withmanyhands.ca` | a future community | its `communities.hosts` row |

One Vercel project serves all of them; one Clerk production instance (primary domain
`withmanyhands.ca`) signs everyone in; one Supabase database holds every community. Adding a
community host is a row + a Vercel domain + a Clerk allowed-subdomain entry + one DNS record —
no deploy, no satellite.

## Env vars (Vercel → production; `.env.local` for local runs)

| Var | Value | Effect when unset |
|---|---|---|
| `PLATFORM_HOSTS` | `withmanyhands.ca,www.withmanyhands.ca` | no platform host: every host resolves to a community (today's behaviour) |
| `PLATFORM_NAME` | `Many Hands` (default) | — |
| `PLATFORM_EMAIL_FROM` | `Many Hands <hello@withmanyhands.ca>` — **only after Resend verifies the domain** | falls back to `RESEND_FROM` (Glåüm's sender) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | the **new** key Clerk issues when the primary domain changes (step 3) | Clerk fails to load |
| `NEXT_PUBLIC_SITE_URL` | `https://glaum.withmanyhands.ca` after cutover | only the local/preview fallback since 2026-09-12 — the request host wins |
| `CLERK_PRIMARY_HOST` | **leave unset** (option 1 has no satellites). It has no default on purpose — setting it turns every host that isn't it or a subdomain of it into a satellite, which loads clerk-js from a non-existent `clerk.<host>` and breaks sign-in (this bit production for a few minutes on 2026-09-12). | no satellites |

## Order of operations

### 1. Vercel — add the domains (no downtime)
Project → Settings → Domains: add `withmanyhands.ca`, `www.withmanyhands.ca` (let Vercel
redirect one to the other), `glaum.withmanyhands.ca`, `demo.withmanyhands.ca`. Vercel shows the
DNS records: apex `A 76.76.21.21` (or ALIAS/ANAME), subdomains `CNAME cname.vercel-dns.com`.
Add them at the registrar; wait for ✓ on each. Keep `camp.glaum.ca` attached for now.

### 2. Env — `PLATFORM_HOSTS` in Vercel, redeploy
`https://withmanyhands.ca/` is now the picker (signed out → sign-in),
`https://glaum.withmanyhands.ca/` is Glåüm, `https://demo.withmanyhands.ca/` is Lantern
Hollow. **Sign-in does not yet work on the new hosts** — Clerk's production instance is still
bound to the old primary domain — which is step 3.

### 3. Clerk — change the primary domain (the one step with a user-visible moment)
Clerk Dashboard → *production instance* → **Domains → Change domain** → `withmanyhands.ca`.
Then, in this order:
1. Add the DNS records Clerk lists for the new domain (the `clerk.` / `accounts.` CNAMEs and
   the email-sending records) at the registrar; wait for Clerk to verify. Allow for DNS
   propagation — Clerk warns of possible downtime in between.
2. Clerk issues a **new publishable key**: put it in Vercel as
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and redeploy. (The secret key is unchanged.)
3. **Allowed Subdomains** — the instance ENFORCES this list (found the hard way 2026-09-12:
   `www.withmanyhands.ca` was missing and its sign-in card rendered blank with the console error
   "The request origin subdomain is not in the allowed subdomains list"). The page is
   `https://dashboard.clerk.com/~/domains/allowed-subdomains` (Domains → Allowed subdomains).
   Every host that serves a sign-in card must be listed: `www.withmanyhands.ca` (the apex
   redirects to it), `glaum.withmanyhands.ca`, `demo.withmanyhands.ca`, and each future
   community host. The primary itself is always allowed.
4. If the dashboard lists social-connection redirect URLs or a JWT issuer used elsewhere,
   update them (none are known to be in use here).
5. Expect every member to sign in again once — sessions are bound to the primary domain.

Local development is unaffected: the dev instance keeps running on `localhost`, `127.0.0.1`
and `*.localhost`.

### 4. Cut Glåüm over
1. Swap Glåüm's host order so `glaum.withmanyhands.ca` comes first (email links use the first
   host — `appOrigin`) and drop `camp.glaum.ca` from the row (one SQL / script update; Claude can
   run it). Set `NEXT_PUBLIC_SITE_URL=https://glaum.withmanyhands.ca` in Vercel.
2. Tell members the new address (the old one stops working when the domain lapses; no redirect
   is kept — decided 2026-09-12).
3. Remove `camp.glaum.ca` from the Vercel project when you are done with it.
4. Docs sweep: references to `camp.glaum.ca` in `docs/` and code comments get updated then.

### 5. Resend — the platform sender
Resend → Domains → add `withmanyhands.ca` → add the DKIM/SPF records → verified. Then in Vercel
`PLATFORM_EMAIL_FROM=Many Hands <hello@withmanyhands.ca>`. Glåüm keeps sending from its own
address: `communities.email_from` was pinned to today's `RESEND_FROM` value on 2026-09-12, so
the `RESEND_FROM` env can go once the platform sender is live. The demo sends from the platform
address.

### 6. Verify
- `https://withmanyhands.ca/` → sign-in → picker lists your communities (Glåüm, Lantern Hollow).
- `https://demo.withmanyhands.ca/` → Lantern Hollow in its theme; sign in; the admin console
  opens (your organizer row).
- `https://glaum.withmanyhands.ca/` → Glåüm, members sign in once, everything as before.
- An unknown `redirect_url` on `/sign-in` (e.g. `https://evil.example`) lands on home instead.
- Emails from the demo carry the platform sender; Glåüm's still carry its own.

## Option 2 (deferred): a community on its own domain
Needs a Clerk **satellite domain** (paid plan): Dashboard → Domains → Satellites → Add satellite
domain → add the `clerk.<host>` CNAME it shows. The app side is already built —
`lib/platform.ts` `clerkDomainConfig()` runs every non-primary, non-local host as a satellite
once `CLERK_PRIMARY_HOST` is set (`proxy.ts` options callback, `ClerkProvider` props, and the
auth pages accept `redirect_url` targets on known hosts). Two things still to do when this is
switched on: replace the hardcoded `/sign-in` links (`components/HeaderClient.tsx`,
`app/page.tsx`, the `redirect('/sign-in')` gates) with Clerk's `buildSignInUrl()` so the
satellite sync parameters are carried, and set `allowedRedirectOrigins` on the primary's
`ClerkProvider` to the known hosts. Log an entry in `docs/generalizability-log.md` if a client
asks for it before then.

## What this does NOT do yet
- Route `withmanyhands.ca` to a marketing/landing page — the picker is the whole platform host
  today (business.md → Showcase ladder rung 3 is the landing page, its own repo).
- Automate the per-community host setup (Vercel domain + Clerk allowed subdomain + DNS).
- Per-community deep-link domains for the native app — the app should use each community's
  first host (`appOrigin`); universal links are a later concern (mobile-companion.md).
