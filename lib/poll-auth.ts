import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { isPlatformOwner } from '@/lib/admin-auth'

// Poll management is open to this community's admins and to members an admin
// has granted `can_manage_polls` (see /api/admin/set-poll-manager) — both are
// columns on the member's `members` row since branch 1d (they were Clerk
// publicMetadata flags before). Returns the caller's userId when allowed,
// otherwise null.
export async function requirePollManager(): Promise<string | null> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null
  const community = await getCommunity()
  const { data } = await tenantDb(community.id)
    .from('members')
    .select('role, can_manage_polls')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  if (data?.role === 'admin' || data?.can_manage_polls === true) return userId
  return (await isPlatformOwner(userId, sessionClaims)) ? userId : null
}
