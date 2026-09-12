import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { getDirectThreadMessages } from '@/lib/inbox'

export const dynamic = 'force-dynamic'

// GET /api/messages/[userId] — fetch thread between current user and [userId].
// Read-only: marking messages as read is handled by POST /api/messages/[userId]/read.
// The thread logic lives in lib/inbox.ts, shared with the server-rendered
// thread page (this route is the client's refresh/poll path).
export async function GET(_req: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const { userId: myId } = await auth()
  if (!myId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const messages = await getDirectThreadMessages((await getCommunity()).id, myId, params.userId)
    return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load messages'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
