import { auth, clerkClient } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'

// Admin is a COMMUNITY-scoped fact (docs/tenancy-design.md §4, branch 1d):
// `members.role = 'admin'` in the current community. A person can run one
// community and be a plain member of another. The one platform-wide identity
// is the PLATFORM OWNER — Clerk `publicMetadata.platformRole === 'owner'`
// (Chanté) — who is an admin everywhere; that claim rides in the session token
// when the instance is configured to include metadata
// (Dashboard → Sessions → Customize session token →
//   {"metadata": "{{user.public_metadata}}"}
// ) so the check costs no network call, and falls back to the backend read.
//
// Before 1d, admin was `publicMetadata.role === 'admin'` for the whole Clerk
// instance; scripts/backfill-member-roles.mjs copied that flag into
// members.role for Glåüm. Nothing reads publicMetadata.role any more.

type Claims = unknown

function claimPlatformRole(sessionClaims: Claims): string | null {
  const metadata = (sessionClaims as { metadata?: unknown } | null)?.metadata
  if (metadata && typeof metadata === 'object') {
    const role = (metadata as { platformRole?: unknown }).platformRole
    return typeof role === 'string' ? role : null
  }
  return null
}

/** Platform owner: admin of every community; the only identity that may create communities. */
export async function isPlatformOwner(userId: string, sessionClaims?: Claims): Promise<boolean> {
  // The claim is only ever a POSITIVE fast path (a token minted mid-config or
  // a differently shaped customization must not lock the owner out).
  if (claimPlatformRole(sessionClaims) === 'owner') return true
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    return user.publicMetadata?.platformRole === 'owner'
  } catch (e) {
    console.error('[admin-auth] platform owner lookup failed', e)
    return false
  }
}

/** Community admin: `members.role = 'admin'` in this community, or the platform owner. */
export async function hasCommunityAdminRole(
  communityId: string,
  userId: string,
  sessionClaims?: Claims,
): Promise<boolean> {
  if (claimPlatformRole(sessionClaims) === 'owner') return true
  const { data, error } = await tenantDb(communityId)
    .from('members')
    .select('role')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  if (error) console.error('[admin-auth] role lookup failed', error)
  if (data?.role === 'admin') return true
  return isPlatformOwner(userId, sessionClaims)
}

/**
 * The standard admin gate for pages and /api/admin routes: the signed-in
 * caller's userId when they administer the request's community, else null.
 * Resolves the community from the request host itself (cached), so call sites
 * that run before their own getCommunity() need no reordering.
 */
export async function requireAdmin(): Promise<string | null> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null
  const community = await getCommunity()
  return (await hasCommunityAdminRole(community.id, userId, sessionClaims)) ? userId : null
}

/** Same gate for callers that already hold the community. */
export async function requireCommunityAdmin(communityId: string): Promise<string | null> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null
  return (await hasCommunityAdminRole(communityId, userId, sessionClaims)) ? userId : null
}

/** Platform-owner-only gate (community creation, cross-community tooling). */
export async function requirePlatformOwner(): Promise<string | null> {
  const { userId, sessionClaims } = await auth()
  if (!userId) return null
  return (await isPlatformOwner(userId, sessionClaims)) ? userId : null
}
