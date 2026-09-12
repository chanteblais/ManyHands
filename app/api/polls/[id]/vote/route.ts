import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getApprovedMember } from '@/lib/members'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  const optionIndexes: number[] = Array.isArray(body.option_indexes) ? body.option_indexes : [body.option_index]

  // Approval gate + poll lookup are independent — one parallel round trip.
  // Polls live on the member dashboard — approved members only.
  const [approvedMember, { data: poll }] = await Promise.all([
    getApprovedMember(community.id, userId),
    db
      .from('polls')
      .select('id, allow_multiple, expires_at, options')
      .eq('id', params.id)
      .eq('visible', true)
      .maybeSingle(),
  ])
  if (!approvedMember) {
    return NextResponse.json({ error: 'Only approved members can vote' }, { status: 403 })
  }
  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
  if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Poll has expired' }, { status: 400 })
  }
  if (!poll.allow_multiple && optionIndexes.length > 1) {
    return NextResponse.json({ error: 'Multiple choices not allowed' }, { status: 400 })
  }
  // Every index must name a real option — an out-of-range index would inflate
  // the counts array returned to every client (counts[999] = 1000 entries).
  const optionCount = (poll.options as unknown[]).length
  if (optionIndexes.length === 0 ||
      !optionIndexes.every(i => Number.isInteger(i) && i >= 0 && i < optionCount)) {
    return NextResponse.json({ error: 'Invalid option selection' }, { status: 400 })
  }

  // Remove existing votes for this user+poll, then insert new ones
  await db.from('poll_votes').delete().eq('poll_id', params.id).eq('clerk_user_id', userId)

  const rows = optionIndexes.map(option_index => ({ poll_id: params.id, clerk_user_id: userId, option_index }))
  const { error } = await db.from('poll_votes').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return updated vote counts
  const { data: votes } = await db
    .from('poll_votes')
    .select('option_index')
    .eq('poll_id', params.id)

  const counts = Array(optionCount).fill(0)
  for (const v of votes ?? []) {
    if (Number.isInteger(v.option_index) && v.option_index >= 0 && v.option_index < optionCount) {
      counts[v.option_index] += 1
    }
  }

  return NextResponse.json({ counts, userVotes: optionIndexes })
}
