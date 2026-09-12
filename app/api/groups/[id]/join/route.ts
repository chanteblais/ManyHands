import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getOrCreateGroupConversation, sendGroupWelcome } from '@/lib/conversations'

export const dynamic = 'force-dynamic'

// POST /api/groups/[id]/join — self-join an open group.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: app } = await db
    .from('members')
    .select('status, suspended_at')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  if (app?.status !== 'approved') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (app.suspended_at) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to join groups.' }, { status: 403 })
  }

  const { data: group } = await db
    .from('groups')
    .select('id, join_policy')
    .eq('id', params.id)
    .maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (group.join_policy !== 'open') {
    return NextResponse.json({ error: "This group isn't open to self-join." }, { status: 403 })
  }

  const { data: inserted, error } = await db.from('group_members').upsert(
    { group_id: params.id, clerk_user_id: userId, source: 'self' },
    { onConflict: 'group_id,clerk_user_id', ignoreDuplicates: true },
  ).select('clerk_user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Make sure the thread exists so it shows up in the inbox, and greet a fresh
  // member with their private welcome note (creates the conversation itself).
  if ((inserted ?? []).length > 0) await sendGroupWelcome(community.id, params.id, userId)
  else await getOrCreateGroupConversation(community.id, params.id).catch(() => {})

  return NextResponse.json({ success: true })
}
