import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { findGroupConversation, isGroupMember, markConversationRead } from '@/lib/conversations'

export const dynamic = 'force-dynamic'

// POST /api/messages/g/[groupId]/read — advance my read cursor for the group thread.
export async function POST(_req: Request, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  if (!(await isGroupMember(community.id, params.groupId, userId))) return NextResponse.json({ ok: true })

  const convId = await findGroupConversation(community.id, params.groupId)
  if (convId) await markConversationRead(community.id, convId, userId)

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
