import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher(['/profile(.*)', '/admin(.*)', '/apply(.*)', '/volunteer(.*)'])

// Central sign-in wall for /admin pages and /api/admin routes: an anonymous
// request never reaches a handler (401 for the API, Clerk's sign-in redirect
// for pages). The ADMIN check itself moved into the handlers in branch 1d —
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

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname === '/api/sign-out') {
    return
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
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
}
