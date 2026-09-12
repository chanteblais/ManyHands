import { tenantDb } from './tenant-db'
import { deleteGroupWelcome } from './conversations'
import type { MemberRecord } from './members'

// Member suspension (migration 063) — shared by the self-serve route
// (/api/profile/suspend) and the admin route (/api/admin/[id]/suspend).
//
// Suspending releases ALL of the member's commitments — their role, groups,
// shifts, and shared-resource claims (the same rows the cancel/remove flows
// clear) — but leaves their status untouched: a suspended member still sees
// the whole site, they just hold nothing and the join endpoints refuse new
// commitments. Lifting the suspension does NOT restore what was released — the
// member re-signs for whatever still fits.

export type SuspensionResult = {
  roleRemoved: boolean
  groupsRemoved: number
  shiftsRemoved: number
  resourceClaimsRemoved: number
}

const EMPTY_RESULT: SuspensionResult = { roleRemoved: false, groupsRemoved: 0, shiftsRemoved: 0, resourceClaimsRemoved: 0 }

export async function suspendMember(
  communityId: string,
  member: MemberRecord,
  byClerkId: string,
  note?: string,
): Promise<SuspensionResult> {
  const db = tenantDb(communityId)
  // Mark first — if a release below fails, the member is still safely
  // suspended and the join gates already hold.
  const { error } = await db
    .from('members')
    .update({
      suspended_at: new Date().toISOString(),
      suspended_by: byClerkId,
      suspension_note: note?.trim() || null,
    })
    .eq('id', member.id)
  if (error) throw new Error(error.message)

  // Commitments are keyed by clerk_user_id; a never-signed-in member holds none.
  if (!member.clerk_user_id) return EMPTY_RESULT

  const [groups, shifts, campSignup, resourceClaims] = await Promise.all([
    // Leaving a group also leaves its message thread (group_members is the
    // source of truth for thread access — see docs/group-messaging.md).
    db
      .from('group_members')
      .delete({ count: 'exact' })
      .eq('clerk_user_id', member.clerk_user_id),
    db
      .from('member_shift_signups')
      .delete({ count: 'exact' })
      .eq('clerk_user_id', member.clerk_user_id),
    // Role + legacy single-shift both live on camp_signups — drop the whole
    // row, same cleanup as the cancel/remove flows.
    db
      .from('camp_signups')
      .delete({ count: 'exact' })
      .eq('clerk_user_id', member.clerk_user_id),
    // Shared-resource claims ("Bring Something") — free them so the board's
    // totals reflect reality while the member is paused.
    db
      .from('resource_claims')
      .delete({ count: 'exact' })
      .eq('clerk_user_id', member.clerk_user_id),
    // Their private group welcome notes go with the memberships (same pairing
    // as the remove/reject flows). Without this, sendGroupWelcome's
    // per-(group, member) idempotence would find the stale note and skip the
    // welcome when they're re-added after resuming. Keep last — the entries
    // above are destructured by position.
    deleteGroupWelcome(member.clerk_user_id),
  ])
  return {
    roleRemoved: (campSignup.count ?? 0) > 0,
    groupsRemoved: groups.count ?? 0,
    shiftsRemoved: shifts.count ?? 0,
    resourceClaimsRemoved: resourceClaims.count ?? 0,
  }
}

export async function liftSuspension(communityId: string, member: MemberRecord): Promise<void> {
  const { error } = await tenantDb(communityId)
    .from('members')
    .update({ suspended_at: null, suspended_by: null, suspension_note: null })
    .eq('id', member.id)
  if (error) throw new Error(error.message)
}
