import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getMemberResourceView } from '@/lib/resources'
import { getCommunity } from '@/lib/community'

// Member view of shared resources — data assembly lives in lib/resources.ts,
// shared with the server-rendered /participate page (this route is the
// client's refresh path after a claim/offer action).
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const view = await getMemberResourceView(community.id, userId)
  return NextResponse.json(view) // { lists, pulse }
}
