/**
 * Resolve the public origin for redirects. The REQUEST host wins whenever it
 * is a real hostname — one deployment serves many communities on many hosts
 * (docs/domains.md), so a deployment-wide NEXT_PUBLIC_SITE_URL would send
 * every other tenant's sign-in returns and sign-out landings to Glåüm.
 * NEXT_PUBLIC_SITE_URL is only a fallback when the host is missing or local.
 */
export function resolveSiteOrigin(headerList: Headers): string {
  const forwardedHost = headerList.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = headerList.get('x-forwarded-proto')
  const rawHost = forwardedHost || headerList.get('host') || ''
  const hostOnly = rawHost.split(':')[0] || ''
  const isLocal = !hostOnly || hostOnly === 'localhost' || hostOnly === '127.0.0.1' || hostOnly.endsWith('.localhost')

  if (!isLocal) {
    const protocol = forwardedProto || 'https'
    return `${protocol}://${rawHost.split(':')[0]}`
  }

  // A local host is its own origin (keeps dev sign-out / returns on the tenant
  // being served — localhost is Glåüm, 127.0.0.1 the demo). The env fallbacks
  // below only apply when there is no host at all (build-time rendering).
  if (hostOnly) {
    return `${forwardedProto || 'http'}://${rawHost}`
  }

  const configured =
    typeof process.env.NEXT_PUBLIC_SITE_URL === 'string'
      ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
      : ''
  if (configured && !configured.includes('localhost')) {
    return configured
  }

  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`
  }

  const host = rawHost || process.env.VERCEL_URL || 'localhost:3000'
  const protocol = forwardedProto || (isLocal ? 'http' : 'https')
  return `${protocol}://${host}`
}

/** Home URL passed to Clerk: absolute only when origin is non-localhost. */
export function clerkFallbackHome(origin: string): string {
  if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) return `${origin.replace(/\/$/, '')}/`
  return '/'
}
