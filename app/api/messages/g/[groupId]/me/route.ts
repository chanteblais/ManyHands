import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { getOrCreateGroupConversation, isGroupMember, setParticipantPrefs } from '@/lib/conversations'

export const dynamic = 'force-dynamic'

// PATCH /api/messages/g/[groupId]/me — set my per-thread prefs (mute / email opt-in).
export async function PATCH(req: Request, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  if (!(await isGroupMember(community.id, params.groupId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const prefs: { muted?: boolean; email_opt_in?: boolean } = {}
  if (typeof body.muted === 'boolean') prefs.muted = body.muted
  if (typeof body.email_opt_in === 'boolean') prefs.email_opt_in = body.email_opt_in
  if (!Object.keys(prefs).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const convId = await getOrCreateGroupConversation(community.id, params.groupId)
  await setParticipantPrefs(community.id, convId, userId, prefs)

  return NextResponse.json({ success: true })
}
