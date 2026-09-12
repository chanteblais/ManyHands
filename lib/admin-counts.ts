import { tenantDb } from './tenant-db'

// Canonical "who is suspended" population (migration 063) — a suspended member
// stays `status = 'approved'` (full read access) but has released every
// commitment, so participation counts should read as if they weren't there.
// Overview's stats and Manage's roster both need this exact set (Overview
// excludes suspended members from its counts and shows them in their own box;
// Manage marks them inline instead of hiding them) — extracted here so the
// query and the "who counts as suspended" definition can never drift apart.
// Mirrors the exclusion already applied to attunement nudges (`lib/attunement-nudge.ts`).
export async function getSuspendedClerkUserIds(communityId: string): Promise<Set<string>> {
  const db = tenantDb(communityId)
  const { data } = await db
    .from('members')
    .select('clerk_user_id')
    .eq('status', 'approved')
    .not('suspended_at', 'is', null)
  return new Set((data ?? []).map(r => r.clerk_user_id).filter((id): id is string => !!id))
}

/** Whether a clerk_user_id is in the suspended set returned by `getSuspendedClerkUserIds`. */
export function isSuspended(clerkUserId: string | null | undefined, suspendedIds: Set<string>): boolean {
  return !!clerkUserId && suspendedIds.has(clerkUserId)
}
