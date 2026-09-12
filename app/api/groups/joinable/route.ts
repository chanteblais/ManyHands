import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'

export const dynamic = 'force-dynamic'

// GET /api/groups/joinable — open + listed groups the member isn't already in.
// Powers the "Find a group" picker in the Messages inbox.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Approval gate, own memberships, and the open-group registry are
  // independent — one parallel round trip instead of three serial ones.
  const [{ data: app }, { data: mine }, { data: groups, error }] = await Promise.all([
    db
      .from('members')
      .select('status')
      .eq('clerk_user_id', userId)
      .maybeSingle(),
    db
      .from('group_members')
      .select('group_id')
      .eq('clerk_user_id', userId),
    db
      .from('groups')
      .select('id, name, icon, icon_image, description')
      .eq('join_policy', 'open')
      .eq('visibility', 'listed')
      .order('sort_order', { ascending: true }),
  ])
  if (app?.status !== 'approved') return NextResponse.json({ groups: [] })
  const myGroupIds = new Set((mine ?? []).map(r => r.group_id))
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ groups: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const joinable = (groups ?? []).filter(g => !myGroupIds.has(g.id))

  // Member counts (one query, joined in JS).
  const { data: memberRows } = joinable.length
    ? await db.from('group_members').select('group_id').in('group_id', joinable.map(g => g.id))
    : { data: [] }
  const counts: Record<string, number> = {}
  for (const r of memberRows ?? []) counts[r.group_id] = (counts[r.group_id] ?? 0) + 1

  return NextResponse.json(
    { groups: joinable.map(g => ({ ...g, member_count: counts[g.id] ?? 0 })) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
