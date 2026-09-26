import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { createDemoGuest, isDemoCommunity, recentDemoGuestCount, DEMO_GUEST_DAILY_CAP } from '@/lib/demo'

export const dynamic = 'force-dynamic'

// POST /api/demo/enter — "Explore as an organizer" on a demo community
// (lib/demo.ts). Open to signed-OUT visitors by design: it mints a throwaway
// guest (Clerk user + admin member row in THIS community only) and returns a
// sign-in ticket the browser redeems. 404 on every non-demo community; a
// visitor who is already signed in keeps their own session.
export async function POST() {
  const { userId } = await auth()
  const community = await getCommunity()
  if (!isDemoCommunity(community)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (userId) return NextResponse.json({ signedIn: true })

  try {
    if ((await recentDemoGuestCount(community.id)) >= DEMO_GUEST_DAILY_CAP) {
      return NextResponse.json({ error: 'The demo is busy today — please try again tomorrow.' }, { status: 429 })
    }
    const { ticket } = await createDemoGuest(community)
    return NextResponse.json({ ticket })
  } catch (e) {
    console.error('[demo/enter]', e)
    return NextResponse.json({ error: 'Could not open the demo — please try again.' }, { status: 500 })
  }
}
