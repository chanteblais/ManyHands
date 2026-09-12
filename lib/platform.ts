// The platform layer above communities (docs/domains.md, docs/tenancy-design.md
// §6). Three env vars, all optional until the platform domain goes live:
//
//   PLATFORM_HOSTS        comma list of hosts that are the platform itself, not a
//                         community — e.g. "withmanyhands.ca,www.withmanyhands.ca".
//                         Requests there get the community picker, never a
//                         community's pages.
//   CLERK_PRIMARY_HOST    ONLY for option 2 (docs/domains.md): the host Clerk's
//                         production instance is bound to. When set, every host
//                         that is neither it, a subdomain of it, nor local is
//                         served as a Clerk SATELLITE (paid plan): sign-in
//                         happens on the primary and returns to the satellite.
//                         Unset (option 1, the live config): no satellites —
//                         subdomains of the primary share Clerk's session on
//                         their own, and clerk-js loads from the primary's
//                         frontend API. It deliberately has NO default: an
//                         accidental satellite loads clerk-js from a
//                         `clerk.<host>` that doesn't exist and breaks sign-in.
//   PLATFORM_NAME         display name of the platform (default "Many Hands").
//
// Unset → single-host behaviour exactly as before (no satellites, no picker
// host), so this is safe to deploy ahead of the DNS/Clerk changes.

export const PLATFORM_NAME = process.env.PLATFORM_NAME || 'Many Hands'
/** Slug of the pseudo-community served on the platform host (lib/community.ts). */
export const PLATFORM_COMMUNITY_SLUG = 'platform'

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?$/i

function list(name: string): string[] {
  return (process.env[name] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

export function platformHosts(): string[] {
  return list('PLATFORM_HOSTS')
}

export function clerkPrimaryHost(): string | null {
  return process.env.CLERK_PRIMARY_HOST?.trim().toLowerCase() || null
}

/** Is this request host the platform root (picker) rather than a community? */
export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase()
  const bare = h.split(':')[0]
  return platformHosts().some(p => p === h || p === bare)
}

export function isLocalHost(host: string): boolean {
  return LOCAL.test(host)
}

export type ClerkDomainConfig =
  | { isSatellite: false }
  | { isSatellite: true; domain: string; signInUrl: string; signUpUrl: string }

/**
 * Clerk multi-domain settings for a request host. The primary host (and any
 * local host) runs Clerk normally; every other host is a satellite of the
 * primary, where the sign-in/sign-up pages live.
 */
export function clerkDomainConfig(host: string): ClerkDomainConfig {
  const primary = clerkPrimaryHost()
  const h = host.toLowerCase()
  const bare = h.split(':')[0]
  // The primary, any subdomain of it (Clerk shares the session there), and
  // local hosts are never satellites.
  if (!primary || isLocalHost(h) || bare === primary || bare.endsWith(`.${primary}`)) return { isSatellite: false }
  return {
    isSatellite: true,
    domain: h.split(':')[0],
    signInUrl: `https://${primary}/sign-in`,
    signUpUrl: `https://${primary}/sign-up`,
  }
}

/** Paths that make sense on the platform host itself; everything else redirects to the picker. */
export function isPlatformPath(pathname: string): boolean {
  return (
    pathname === '/communities' ||
    pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname === '/sign-out' ||
    pathname === '/api/sign-out' || pathname === '/api/nav-auth' || pathname.startsWith('/api/me/') || pathname === '/api/communities'
  )
}
