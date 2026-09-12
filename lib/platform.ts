// The platform layer above communities (docs/domains.md, docs/tenancy-design.md
// §6). Three env vars, all optional until the platform domain goes live:
//
//   PLATFORM_HOSTS        comma list of hosts that are the platform itself, not a
//                         community — e.g. "withmanyhands.ca,www.withmanyhands.ca".
//                         Requests there get the community picker, never a
//                         community's pages.
//   CLERK_PRIMARY_HOST    the host Clerk's production instance is bound to (its
//                         primary domain). Every other non-local host is served as
//                         a Clerk SATELLITE: sign-in happens on the primary and
//                         returns to the satellite. Defaults to the first
//                         PLATFORM_HOSTS entry.
//   PLATFORM_NAME         display name of the platform (default "Many Hands").
//
// Unset → single-host behaviour exactly as before (no satellites, no picker
// host), so this is safe to deploy ahead of the DNS/Clerk changes.

export const PLATFORM_NAME = process.env.PLATFORM_NAME || 'Many Hands'

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?$/i

function list(name: string): string[] {
  return (process.env[name] ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
}

export function platformHosts(): string[] {
  return list('PLATFORM_HOSTS')
}

export function clerkPrimaryHost(): string | null {
  return process.env.CLERK_PRIMARY_HOST?.trim().toLowerCase() || platformHosts()[0] || null
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
  if (!primary || isLocalHost(h) || h === primary || h.split(':')[0] === primary) return { isSatellite: false }
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
    pathname === '/api/sign-out' || pathname === '/api/nav-auth' || pathname.startsWith('/api/me/') ||
    pathname === '/manifest.webmanifest'
  )
}
