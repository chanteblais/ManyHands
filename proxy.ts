import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { clerkDomainConfig, isPlatformHost, isPlatformPath } from '@/lib/platform'

const isProtectedRoute = createRouteMatcher(['/profile(.*)', '/admin(.*)', '/apply(.*)', '/volunteer(.*)'])

// Central sign-in wall for /admin pages and /api/admin routes: an anonymous
// request never reaches a handler (401 for the API, Clerk's sign-in redirect
// for pages). The ADMIN check itself lives in the handlers (branch 1d) —
// admin is a per-community fact on `members.role` (lib/admin-auth.ts
// requireAdmin), which this edge layer can't read cheaply. Every /api/admin
// route's gate is asserted statically by scripts/check-route-auth.mjs, and
// every /admin page calls requireAdmin() before rendering, so the two layers
// still back each other up.
//
// /api/admin/polls is the one deliberate exception to the admin gate: poll
// management is open to members an admin granted `can_manage_polls`
// (lib/poll-auth.ts requirePollManager gates it in-route), and the
// home-dashboard PollWidget calls it as those members — it still needs a
// session, so it stays behind the sign-in wall here.
const isAdminRoute = createRouteMatcher(['/admin(.*)', '/api/admin(.*)'])

function requestHost(req: { headers: Headers }): string {
  return (req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host') || '').toLowerCase()
}

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname === '/api/sign-out') {
    return
  }

  // The platform host (docs/domains.md) is the picker + auth pages, nothing
  // else: `/` rewrites to the picker, community pages redirect to it.
  if (isPlatformHost(requestHost(req))) {
    const { pathname } = req.nextUrl
    if (pathname === '/') return NextResponse.rewrite(new URL('/communities', req.url))
    if (!isPlatformPath(pathname) && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/communities', req.url))
    }
    if (pathname.startsWith('/api/') && !isPlatformPath(pathname)) {
      return NextResponse.json({ error: 'Not a community host' }, { status: 404 })
    }
  }

  if (isAdminRoute(req)) {
    const { userId } = await auth()
    if (!userId) {
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      await auth.protect() // Clerk sign-in redirect for pages
    }
    return
  }

  if (isProtectedRoute(req)) {
    await auth.protect()
  }
}, req => {
  // Clerk multi-domain: every non-primary, non-local host is a satellite of
  // CLERK_PRIMARY_HOST (lib/platform.ts). Unset → plain single-domain Clerk.
  const cfg = clerkDomainConfig(requestHost(req))
  return cfg.isSatellite
    ? { isSatellite: true, domain: cfg.domain, signInUrl: cfg.signInUrl, signUpUrl: cfg.signUpUrl }
    : {}
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
}
