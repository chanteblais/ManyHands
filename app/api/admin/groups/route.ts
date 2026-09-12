import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getOrCreateGroupConversation } from '@/lib/conversations'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: groups, error } = await db
    .from('groups')
    .select('id, name, description, icon, icon_image, apply_selectable, sort_order, join_policy, visibility, collection_id, required_shift_type_id, required_shift_hours')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach a member count to each group (one extra query, joined in JS).
  const { data: memberRows } = await db
    .from('group_members')
    .select('group_id')
  const counts: Record<string, number> = {}
  for (const r of memberRows ?? []) counts[r.group_id] = (counts[r.group_id] ?? 0) + 1

  return NextResponse.json({
    groups: (groups ?? []).map(g => ({ ...g, member_count: counts[g.id] ?? 0 })),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  const { name, description, icon, icon_image, apply_selectable, sort_order, join_policy, visibility, collection_id, required_shift_type_id, required_shift_hours } = body

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await db
    .from('groups')
    .insert({
      name,
      description: description ?? null,
      icon: icon ?? null,
      icon_image: icon_image || null,
      apply_selectable: !!apply_selectable,
      sort_order: sort_order ?? 0,
      required_shift_type_id: required_shift_type_id || null,
      required_shift_hours: required_shift_hours === '' || required_shift_hours == null ? null : Number(required_shift_hours),
      ...(join_policy ? { join_policy } : {}),
      ...(visibility ? { visibility } : {}),
      ...(collection_id ? { collection_id } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Give the new group its message thread up front so members have an entry point.
  try {
    await getOrCreateGroupConversation(community.id, data.id)
  } catch (err) {
    console.error('[POST /api/admin/groups] conversation create failed:', err)
  }

  return NextResponse.json({ group: { ...data, member_count: 0 } })
}
