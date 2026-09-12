import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { listCommunitiesForUser } from '@/lib/community'
import { appOrigin } from '@/lib/send-email'

export const dynamic = 'force-dynamic'

// The signed-in person's communities (docs/tenancy-design.md §6) — feeds the
// shared app's community switcher and the web picker at /communities. One
// entry per membership row, across every community the person belongs to.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const memberships = await listCommunitiesForUser(userId)
  return NextResponse.json(
    {
      communities: memberships.map(({ community, status, role }) => ({
        slug: community.slug,
        name: community.name,
        description: community.description,
        eventName: community.eventName,
        url: appOrigin(community),
        status,
        role,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
