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
    const { name, description, sort_order } = body
    const icon = body.icon === '' ? null : (body.icon ?? null)

    const update: Record<string, unknown> = { name, description, icon }
    if (sort_order !== undefined) update.sort_order = sort_order

    const { data, error } = await db
      .from('departments')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ department: data })
  } catch (err) {
    console.error('[PATCH /api/admin/departments/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { error } = await db.from('departments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
