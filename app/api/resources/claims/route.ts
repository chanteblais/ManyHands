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

// Set the caller's claim on a resource. quantity >= 1 upserts the single
// per-member claim row; quantity 0 removes it (unclaiming is always allowed —
// the totals should reflect reality, not hold members hostage).
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { resource_id, quantity } = await req.json()
  if (!resource_id || typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return NextResponse.json({ error: 'resource_id and quantity are required' }, { status: 400 })
  }
  const qty = Math.min(99, Math.max(0, Math.floor(quantity)))

  // Member gate + resource lookup are independent — one parallel round trip.
  // Approved members only — same gate as the /participate page this backs.
  const [member, { data: resource }] = await Promise.all([
    getApprovedMember(community.id, userId),
    db
      .from('resources')
      .select('id, name, list_id, offered_by, resource_lists(visible)')
      .eq('id', resource_id)
      .maybeSingle(),
  ])
  if (!member) {
    return NextResponse.json({ error: 'Only approved members can claim resources' }, { status: 403 })
  }

  // A suspended member can drop a claim (qty 0) but can't take on a new one.
  if (qty > 0 && member.suspended_at) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to bring items.' }, { status: 403 })
  }

  // Only items on a member-visible list can be claimed.
  const list = Array.isArray(resource?.resource_lists) ? resource?.resource_lists[0] : resource?.resource_lists
  if (!resource || !(list as { visible: boolean } | null | undefined)?.visible) {
    return NextResponse.json({ error: 'This item is not available' }, { status: 403 })
  }

  if (qty === 0) {
    const { error } = await db
      .from('resource_claims')
      .delete()
      .eq('resource_id', resource_id)
      .eq('clerk_user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Retracting your own offer removes the listing too — unless others have
    // piled on, in which case the item has become communal and stays.
    if (resource.offered_by === userId) {
      const { count } = await db
        .from('resource_claims')
        .select('id', { count: 'exact', head: true })
        .eq('resource_id', resource_id)
      if ((count ?? 0) === 0) {
        await db.from('resources').delete().eq('id', resource_id)
      }
    }
  } else {
    const { data: priorClaim } = await db
      .from('resource_claims')
      .select('id')
      .eq('resource_id', resource_id)
      .eq('clerk_user_id', userId)
      .maybeSingle()

    const { error } = await db
      .from('resource_claims')
      .upsert(
        { resource_id, clerk_user_id: userId, quantity: qty, updated_at: new Date().toISOString() },
        { onConflict: 'resource_id,clerk_user_id' },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Radio: only the FIRST claim on an item is a moment (a new commitment) —
    // quantity edits are silent, and unclaims are never broadcast.
    if (!priorClaim && resource.name) {
      const [actorName, state] = await Promise.all([
        getRadioActorName(community.id, userId),
        resourceStateAfterClaim(community.id, resource_id, resource.list_id),
      ])
      await postSourcedRadioEvent(community.id, 'contribution', {
        ...contributionRadioPost(actorName, resource.name, qty, state.remaining),
        actorClerkId: userId,
        actorName,
      })
      // A claim that completes the whole list is a community milestone.
      if (state.listJustCompleted && state.listTitle) {
        await postSourcedRadioEvent(community.id, 'milestone', listMilestoneRadioPost(state.listTitle))
      }
    }
  }

  return NextResponse.json({ success: true, quantity: qty })
}
