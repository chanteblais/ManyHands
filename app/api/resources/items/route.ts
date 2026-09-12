import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getApprovedMember } from '@/lib/members'
import {
  postSourcedRadioEvent,
  getRadioActorName,
  contributionRadioPost,
  listMilestoneRadioPost,
  resourceStateAfterClaim,
} from '@/lib/radio'

// Add an item to a resource list. Shared Resources is member-owned
// (2026-07-08): any approved member adds items, with an optional target
// (`quantity_needed` — blank = an open offer nobody was asked for) and an
// optional self-claim (`bring`). This is the single member "add item" path —
// it absorbed the former /api/resources/offers route. `offered_by` records who
// added it (retracting your own last claim on an untargeted item still removes
// the listing — see the claims route).
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const member = await getApprovedMember(community.id, userId)
  if (!member) {
    return NextResponse.json({ error: 'Only approved members can add resources' }, { status: 403 })
  }
  if (member.suspended_at) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to bring items.' }, { status: 403 })
  }

  const { list_id, name, note, quantity_needed, bring } = await req.json()
  if (!list_id) return NextResponse.json({ error: 'list_id is required' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  // Items only land on lists members can see.
  const { data: list } = await db
    .from('resource_lists')
    .select('id, visible')
    .eq('id', list_id)
    .maybeSingle()
  if (!list?.visible) return NextResponse.json({ error: 'This list is not available' }, { status: 403 })

  // Blank/absent target → NULL (open offer); otherwise clamp to 1–99.
  const needed =
    quantity_needed === undefined || quantity_needed === null || quantity_needed === ''
      ? null
      : Math.min(99, Math.max(1, Math.floor(Number(quantity_needed) || 1)))

  const { data: item, error } = await db
    .from('resources')
    .insert({
      list_id,
      name: name.trim().slice(0, 80),
      note: note?.trim().slice(0, 200) || null,
      quantity_needed: needed,
      offered_by: userId,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed the adder's claim when they're bringing it themselves.
  if (bring !== false) {
    const { error: claimError } = await db
      .from('resource_claims')
      .insert({ resource_id: item.id, clerk_user_id: userId, quantity: 1 })
    if (claimError) {
      // Don't leave an orphan item behind on a failed claim.
      await db.from('resources').delete().eq('id', item.id)
      return NextResponse.json({ error: claimError.message }, { status: 500 })
    }

    // Radio: adding an item you'll bring is the same commitment moment as a
    // first claim. Compute the after-state so the copy carries the countdown
    // (targeted) or reads as an open offer (untargeted), and a fill that
    // completes the list is a community milestone.
    const [actorName, state] = await Promise.all([
      getRadioActorName(community.id, userId),
      resourceStateAfterClaim(community.id, item.id, list_id),
    ])
    await postSourcedRadioEvent(community.id, 'contribution', {
      ...contributionRadioPost(actorName, item.name, 1, state.remaining),
      actorClerkId: userId,
      actorName,
    })
    if (state.listJustCompleted && state.listTitle) {
      await postSourcedRadioEvent(community.id, 'milestone', listMilestoneRadioPost(state.listTitle))
    }
  }

  return NextResponse.json({ success: true, item })
}
