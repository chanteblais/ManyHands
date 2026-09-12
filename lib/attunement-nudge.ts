import { tenantDb } from '@/lib/tenant-db'
import {
  buildAttunementChecklist,
  memberGroupCounts,
  requiredItems,
  commitmentItems,
  type AttunementChecklistItem,
} from '@/lib/attunement'
import { getMemberShiftState } from '@/lib/shift-attunement'
import { parseDuesConfig, duesAppliesToMembers } from '@/lib/dues'
import { getMemberGroups } from '@/lib/groups'

// Everything the nudge email needs to know about one member. Built with the
// SAME checklist builder as the home banner and profile card, so the email's
// outstanding list always matches what the member sees on the site.
export type MemberAttunement = {
  clerkUserId: string
  email: string | null
  name: string
  outstandingRequired: AttunementChecklistItem[]
  outstandingCommitments: AttunementChecklistItem[]
}

// getMemberShiftState + getMemberGroups are per-member helpers (a handful of
// queries each); run members through them in small parallel batches so a full
// camp sweep stays well inside the cron function's time budget.
const BATCH_SIZE = 8

/**
 * Compute the attunement checklist for every approved member with an account,
 * returning only those with at least one outstanding item. Members without a
 * clerk_user_id are skipped — they can't have groups/shifts/roles yet, and the
 * email's links would land them nowhere actionable.
 */
export async function collectOutstandingAttunement(communityId: string): Promise<MemberAttunement[]> {
  const db = tenantDb(communityId)
  const [{ data: membersRaw }, { data: configRows }] = await Promise.all([
    db
      .from('members')
      .select('clerk_user_id, email, first_name, preferred_name, avatar_url, dues_paid_at, dues_reported_at')
      .eq('status', 'approved')
      // Suspended members have no commitments to chase — don't nudge them (063).
      .is('suspended_at', null),
    db
      .from('page_content')
      .select('key, value')
      .in('key', ['config_attunement_tasks', 'config_shift_signup_open', 'config_dues']),
  ])

  const config = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value]))
  const duesActiveForMembers = duesAppliesToMembers(parseDuesConfig(config['config_dues']))
  const members = (membersRaw ?? []).filter(m => m.clerk_user_id)
  if (members.length === 0) return []

  // Role state for everyone in one query (fetch + join in JS).
  const { data: signupRows } = await db
    .from('camp_signups')
    .select('clerk_user_id, role_id, role_approval_status')
    .in('clerk_user_id', members.map(m => m.clerk_user_id as string))
  const signupByClerkId = new Map((signupRows ?? []).map(r => [r.clerk_user_id, r]))

  const results: MemberAttunement[] = []
  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE)
    const states = await Promise.all(
      batch.map(async m => {
        const clerkId = m.clerk_user_id as string
        const [memberGroups, shiftState] = await Promise.all([
          getMemberGroups(communityId, clerkId),
          getMemberShiftState(communityId, clerkId),
        ])
        const signup = signupByClerkId.get(clerkId)
        const { groupCountsByCollection, totalGroupCount } = memberGroupCounts(memberGroups)
        const tasks = buildAttunementChecklist(config['config_attunement_tasks'], {
          hasPhoto: !!m.avatar_url,
          duesPaid: !!m.dues_paid_at,
          duesReported: !!m.dues_reported_at,
          duesActiveForMembers,
          groupCountsByCollection,
          totalGroupCount,
          roleDone: !!signup?.role_id && signup?.role_approval_status !== 'pending',
          hasShift: shiftState.hasShift,
          shiftSignupOpen: config['config_shift_signup_open'] !== 'false',
          hoursByShiftType: shiftState.hoursByShiftType,
          derivedShiftRequirements: shiftState.derivedShiftRequirements,
        })
        return {
          clerkUserId: clerkId,
          email: m.email ?? null,
          name: m.preferred_name || m.first_name || 'there',
          outstandingRequired: requiredItems(tasks).filter(t => !t.done),
          outstandingCommitments: commitmentItems(tasks).filter(t => !t.done),
        }
      })
    )
    for (const s of states) {
      if (s.outstandingRequired.length > 0 || s.outstandingCommitments.length > 0) results.push(s)
    }
  }
  return results
}
