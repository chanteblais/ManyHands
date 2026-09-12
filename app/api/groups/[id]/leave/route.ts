import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { findGroupConversation, deleteGroupWelcome } from '@/lib/conversations'

export const dynamic = 'force-dynamic'

// POST /api/groups/[id]/leave — leave an open group. Admin-assigned groups are
// admin-managed: a member can't unilaterally leave (would drop a camp responsibility).
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: group } = await db
    .from('groups')
    .select('id, join_policy')
    .eq('id', params.id)
    .maybeSingle()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (group.join_policy !== 'open') {
    return NextResponse.json({ error: 'Ask an admin to remove you from this group.' }, { status: 403 })
  }

  const { error } = await db
    .from('group_members')
    .delete()
    .eq('group_id', params.id)
    .eq('clerk_user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clean up my participant row so read/mute state doesn't linger, and my
  // private welcome note so a later re-join welcomes freshly.
  const convId = await findGroupConversation(community.id, params.id)
  if (convId) {
    await db
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', convId)
      .eq('clerk_user_id', userId)
  }
  await deleteGroupWelcome(community.id, userId, params.id)

  return NextResponse.json({ success: true })
}
