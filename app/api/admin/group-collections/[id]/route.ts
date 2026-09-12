import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const community = await getCommunity()
    const db = tenantDb(community.id)

    const body = await req.json()
    const update: Record<string, unknown> = {}
    if (body.name !== undefined) update.name = body.name
    if (body.description !== undefined) update.description = body.description === '' ? null : body.description
    if (body.sort_order !== undefined) update.sort_order = body.sort_order
    if (body.show_on_profile !== undefined) update.show_on_profile = !!body.show_on_profile
    if (body.self_join !== undefined) update.self_join = !!body.self_join
    if (body.selection !== undefined) {
      if (body.selection !== 'single' && body.selection !== 'multi') {
        return NextResponse.json({ error: 'selection must be single or multi' }, { status: 400 })
      }
      update.selection = body.selection
    }

    const { data, error } = await db
      .from('group_collections')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ collection: data })
  } catch (err) {
    console.error('[PATCH /api/admin/group-collections/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Refuse to delete a collection that still holds groups — the admin must move
  // or delete those groups first. Prevents silently orphaning leaves (which the
  // FK's ON DELETE SET NULL would otherwise do).
  const { count } = await db
    .from('groups')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `This collection still has ${count} group${count === 1 ? '' : 's'}. Move or delete them first.` },
      { status: 400 },
    )
  }

  const { error } = await db.from('group_collections').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
