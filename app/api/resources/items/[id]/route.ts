import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getApprovedMember } from '@/lib/members'

// Edit (PATCH) or delete (DELETE) an item. Wiki-open — any approved member can
// edit an item's name/note/target or remove it (member-owned resources,
// 2026-07-08). Deleting an item cascades its claims; the client surfaces a
// claim-count confirm before calling DELETE. Deleting a whole LIST is the only
// admin-gated action (see lists/[id]/route.ts).

async function gate(communityId: string, userId: string | null) {
  if (!userId) return { error: 'Unauthorized', status: 401 as const }
  const member = await getApprovedMember(communityId, userId)
  if (!member) return { error: 'Only approved members can manage resources', status: 403 as const }
  if (member.suspended_at) return { error: 'Your attendance is suspended — resume it on your profile to manage resources.', status: 403 as const }
  return null
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  const community = await getCommunity()
  const db = tenantDb(community.id)
  const denied = await gate(community.id, userId)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const { name, note, quantity_needed } = await req.json()
  const patch: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    patch.name = name.trim().slice(0, 80)
  }
  if (note !== undefined) patch.note = note?.trim().slice(0, 200) || null
  if (quantity_needed !== undefined) {
    patch.quantity_needed =
      quantity_needed === null || quantity_needed === ''
        ? null
        : Math.min(99, Math.max(1, Math.floor(Number(quantity_needed) || 1)))
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await db.from('resources').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  const community = await getCommunity()
  const db = tenantDb(community.id)
  const denied = await gate(community.id, userId)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

  const { error } = await db.from('resources').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
