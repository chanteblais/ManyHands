import { auth } from '@clerk/nextjs/server'
import { resolveMemberForUser } from '@/lib/members'
import { getCommunity } from '@/lib/community'
import { HeaderClient, type NavAuthState } from './HeaderClient'

// Server side of the nav: resolves the signed-in member's state during the
// page render so the client header shows the right nav on first paint — no
// flash of the signed-out nav while /api/nav-auth round-trips.
// resolveMemberForUser (not the clerk-id-only resolveMember): the SAME
// resolver the pages' own gates use, so the nav can never disagree with the
// page about membership (a member resolved via the email fallback used to get
// the public nav on a members-only page). The fallback — currentUser(), which
// Clerk request-caches — only runs on a clerk-id miss; approved members with
// linked rows stay on the indexed fast path, and resolveMember's own
// request-cache still shares the lookup with the page.
export async function Header() {
  let initialAuth: NavAuthState = { isSignedIn: false }
  try {
    const { userId } = await auth()
    if (userId) {
      const community = await getCommunity()
      const member = await resolveMemberForUser(community.id, userId)
      initialAuth = {
        isSignedIn: true,
        isApproved: member?.status === 'approved',
        firstName: member?.preferred_name ?? member?.first_name ?? null,
        email: member?.email ?? null,
        avatarUrl: member?.avatar_url ?? null,
        isAdmin: member?.role === 'admin',
      }
    }
  } catch {
    // Render the signed-out nav on any auth hiccup; the client's Clerk state
    // still corrects it after hydration.
  }
  return <HeaderClient initialAuth={initialAuth} />
}
