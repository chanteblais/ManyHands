// Manually-attributed distinctions (member_distinctions). The exception to the
// "derive, never persist" rule for distinctions: these are honorary / one-off
// awards an admin grants by hand, unioned with the rule-derived ones by
// evaluateDistinctions (lib/distinctions.ts). All functions are GUARDED — a
// missing table or error logs and returns a benign value, so the medal display
// degrades to rule-derived-only rather than breaking.

import { tenantDb } from './tenant-db'

/** Distinction ids manually granted to a member. */
export async function getMemberAwards(communityId: string, memberId: string): Promise<string[]> {
  try {
    const { data } = await tenantDb(communityId)
      .from('member_distinctions')
      .select('distinction_id')
      .eq('member_id', memberId)
    return (data ?? []).map(r => r.distinction_id as string)
  } catch (e) {
    console.error('[awards] getMemberAwards failed', e)
    return []
  }
}

export async function grantDistinction(
  communityId: string,
  memberId: string,
  distinctionId: string,
  grantedBy: string,
  note?: string,
): Promise<boolean> {
  try {
    const { error } = await tenantDb(communityId)
      .from('member_distinctions')
      .upsert(
        [{ member_id: memberId, distinction_id: distinctionId, granted_by: grantedBy, note: note ?? null, granted_at: new Date().toISOString() }],
        { onConflict: 'member_id,distinction_id', ignoreDuplicates: true },
      )
    if (error) { console.error('[awards] grant', error); return false }
    return true
  } catch (e) {
    console.error('[awards] grantDistinction failed', e)
    return false
  }
}

export async function revokeDistinction(communityId: string, memberId: string, distinctionId: string): Promise<boolean> {
  try {
    const { error } = await tenantDb(communityId)
      .from('member_distinctions')
      .delete()
      .eq('member_id', memberId)
      .eq('distinction_id', distinctionId)
    if (error) { console.error('[awards] revoke', error); return false }
    return true
  } catch (e) {
    console.error('[awards] revokeDistinction failed', e)
    return false
  }
}
