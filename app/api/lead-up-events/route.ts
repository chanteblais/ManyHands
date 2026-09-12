import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getMemberLeadUpEvents } from '@/lib/lead-up'

// GET — visible lead-up gatherings for the current member, each with its RSVP
// headcount and whether this member has RSVP'd. Drives the /schedule section.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Only approved members see lead-up gatherings.
  const { data: member } = await db
    .from('members')
    .select('status')
    .eq('clerk_user_id', userId)
    .eq('status', 'approved')
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Assembly lives in lib/lead-up.ts (shared with /schedule's server render);
  // this route is the client's refresh path.
  try {
    return NextResponse.json({ events: await getMemberLeadUpEvents(community.id, userId) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
