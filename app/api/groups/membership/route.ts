import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb, type TenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getSelfJoinGroups } from '@/lib/participate-data'
import { getApprovedMember } from '@/lib/members'
import { sendGroupWelcome, deleteGroupWelcome } from '@/lib/conversations'

// Member-facing self-service for opt-in groups (e.g. Setup / Teardown / Decor).
// A group is self-joinable iff its collection has self_join = true. This is a
// single collection-level gate (migration 044) — profile display (show_on_profile)
// is an independent, orthogonal concern. Groups with no collection are not
// self-joinable (there's no collection to opt them in). The apply-form
// `group_select` field governs the application wizard only, not this surface.

// Returns the set of group ids members may opt into on the Participate page.
async function selectableGroupIds(db: TenantDb): Promise<Set<string>> {
  const { data: groups, error } = await db
    .from('groups')
    .select('id, collection_id, group_collections(self_join)')

  // Table missing (pre-migration) → nothing selectable rather than a 500.
  if (error) return new Set<string>()

  type Row = {
    id: string
    collection_id: string | null
    // Supabase types the embed as an array; runtime returns a single row for a to-one FK.
    group_collections: { self_join: boolean } | { self_join: boolean }[] | null
  }

  const ids = new Set<string>()
  for (const g of (groups ?? []) as unknown as Row[]) {
    const col = Array.isArray(g.group_collections) ? g.group_collections[0] : g.group_collections
    if (col?.self_join) ids.add(g.id)
  }
  return ids
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()

  // Data assembly lives in lib/participate-data.ts, shared with the
  // server-rendered /participate page (this route is the client's refresh path).
  const groups = await getSelfJoinGroups(community.id, userId)
  return NextResponse.json({ groups })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Approved members only — same gate as the /participate page this backs.
  const member = await getApprovedMember(community.id, userId)
  if (!member) {
    return NextResponse.json({ error: 'Only approved members can join groups' }, { status: 403 })
  }

  const { group_id, joined } = await req.json()
  if (!group_id || typeof joined !== 'boolean') {
    return NextResponse.json({ error: 'group_id and joined are required' }, { status: 400 })
  }

  // A suspended member can still leave a group but can't take on new ones.
  if (joined && member.suspended_at) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to join groups.' }, { status: 403 })
  }

  // Only selectable groups in a visible collection are self-manageable.
  const ids = await selectableGroupIds(db)
  if (!ids.has(group_id)) {
    return NextResponse.json({ error: 'This group cannot be self-managed' }, { status: 403 })
  }

  if (joined) {
    const { data: inserted, error } = await db
      .from('group_members')
      .upsert({ group_id, clerk_user_id: userId, source: 'application' }, { onConflict: 'group_id,clerk_user_id', ignoreDuplicates: true })
      .select('clerk_user_id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Fresh membership → private welcome note in the group thread (their unread
    // badge confirms the join and points them at the thread).
    if ((inserted ?? []).length > 0) await sendGroupWelcome(community.id, group_id, userId)
  } else {
    const { error } = await db
      .from('group_members')
      .delete()
      .eq('group_id', group_id)
      .eq('clerk_user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Clear the welcome note so a later re-join welcomes freshly.
    await deleteGroupWelcome(community.id, userId, group_id)
  }

  return NextResponse.json({ success: true, joined })
}
